"""
Iteration 5 backend tests — Phase 2 (per-patient billing) + Phase 3 (public patient portal).
Covers:
  - GET /api/patients/{id}/portal (auth) — lazy token, idempotent
  - GET /api/public/patient/{token} (no auth) — clinic/patient/chart/invoices/financials, 404 on bad token
  - Financial correctness in portal
  - New POST /api/patients auto-generates portal_token
  - Booking-created patient auto-generates portal_token
  - Regressions: SYP/USD persistence, RBAC 403 for assistant, chart persistence, partial PATCH
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

DOCTOR = {"email": "doctor@demo.com", "password": "demo1234"}
ASSISTANT = {"email": "assistant@demo.com", "password": "demo1234"}


# ------------------------ Fixtures ------------------------
@pytest.fixture(scope="module")
def doctor_token():
    r = requests.post(f"{API}/auth/login", json=DOCTOR, timeout=15)
    assert r.status_code == 200, f"doctor login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def assistant_token():
    r = requests.post(f"{API}/auth/login", json=ASSISTANT, timeout=15)
    assert r.status_code == 200, f"assistant login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def hdr(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def a_hdr(assistant_token):
    return {"Authorization": f"Bearer {assistant_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tenant_id(doctor_token):
    # Decode JWT payload to get tenant_id
    import base64, json
    payload_b64 = doctor_token.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    return payload["tenant_id"]


@pytest.fixture
def new_patient(hdr):
    """Create a fresh patient and yield it; delete at teardown."""
    payload = {
        "full_name": f"TEST_Iter5_{uuid.uuid4().hex[:6]}",
        "phone": f"09{uuid.uuid4().int % 100000000:08d}",
        "email": "", "date_of_birth": "", "gender": "",
        "address": "", "medical_history": "سكر", "allergies": "بنسلين",
        "medications": "", "notes": "", "doctor_notes": "",
    }
    r = requests.post(f"{API}/patients", json=payload, headers=hdr, timeout=10)
    assert r.status_code == 200, r.text
    p = r.json()
    yield p
    # Teardown
    requests.delete(f"{API}/patients/{p['id']}", headers=hdr, timeout=10)


# ------------------------ Auth portal endpoint ------------------------
class TestPatientPortalAuthEndpoint:
    def test_create_patient_has_portal_token(self, new_patient):
        assert new_patient.get("portal_token"), "New patient must be created with portal_token"
        assert len(new_patient["portal_token"]) >= 8

    def test_get_patient_portal_returns_token_and_url(self, hdr, new_patient):
        r = requests.get(f"{API}/patients/{new_patient['id']}/portal", headers=hdr, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and "url" in body
        assert body["token"] == new_patient["portal_token"]
        assert body["url"].endswith(f"/p/{body['token']}")

    def test_get_patient_portal_is_idempotent(self, hdr, new_patient):
        r1 = requests.get(f"{API}/patients/{new_patient['id']}/portal", headers=hdr, timeout=10)
        r2 = requests.get(f"{API}/patients/{new_patient['id']}/portal", headers=hdr, timeout=10)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["token"] == r2.json()["token"], "Second call must return SAME token"

    def test_portal_endpoint_requires_auth(self, new_patient):
        r = requests.get(f"{API}/patients/{new_patient['id']}/portal", timeout=10)
        assert r.status_code in (401, 403)

    def test_portal_endpoint_404_for_unknown_patient(self, hdr):
        r = requests.get(f"{API}/patients/does-not-exist/portal", headers=hdr, timeout=10)
        assert r.status_code == 404


# ------------------------ Public portal endpoint ------------------------
class TestPublicPatientPortal:
    def test_public_portal_invalid_token_404(self):
        r = requests.get(f"{API}/public/patient/definitely-not-a-real-token-xyz", timeout=10)
        assert r.status_code == 404

    def test_public_portal_no_auth_required(self, hdr, new_patient):
        # Fetch token first (auth), then hit public endpoint with NO Authorization header
        pr = requests.get(f"{API}/patients/{new_patient['id']}/portal", headers=hdr, timeout=10)
        token = pr.json()["token"]

        r = requests.get(f"{API}/public/patient/{token}", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        # Shape assertions
        assert set(["clinic", "patient", "chart", "invoices", "financials"]).issubset(body.keys())
        assert "name" in body["clinic"]
        assert body["patient"]["full_name"] == new_patient["full_name"]
        assert body["patient"]["medical_history"] == "سكر"
        assert body["patient"]["allergies"] == "بنسلين"
        assert isinstance(body["chart"], list)
        assert isinstance(body["invoices"], list)
        assert set(["total_billed", "total_paid", "remaining"]).issubset(body["financials"].keys())
        # Empty by default
        assert body["financials"]["total_billed"] == 0
        assert body["financials"]["total_paid"] == 0
        assert body["financials"]["remaining"] == 0

    def test_public_portal_reflects_chart_and_invoices_and_financials(self, hdr, new_patient):
        pid = new_patient["id"]
        # 1) Set a tooth
        rc = requests.post(f"{API}/patients/{pid}/chart", headers=hdr,
                           json={"tooth": 13, "condition": "caries", "note": "test"}, timeout=10)
        assert rc.status_code == 200, rc.text

        # 2) Add a patient invoice (kind=patient) — using invoices endpoint
        inv_payload = {
            "kind": "patient", "patient_id": pid,
            "date": "2025-01-15",
            "items": [{"description": "حشوة", "quantity": 1, "unit_price": 50000}],
            "total": 50000, "paid": 20000, "currency": "SYP",
        }
        ri = requests.post(f"{API}/invoices", headers=hdr, json=inv_payload, timeout=10)
        assert ri.status_code == 200, ri.text
        invoice_id = ri.json()["id"]

        # 3) Get portal token
        token = requests.get(f"{API}/patients/{pid}/portal", headers=hdr, timeout=10).json()["token"]

        # 4) Public fetch — must reflect chart + invoice + financials
        r = requests.get(f"{API}/public/patient/{token}", timeout=10)
        assert r.status_code == 200
        body = r.json()

        # Chart
        chart_teeth = {c["tooth"]: c["condition"] for c in body["chart"]}
        assert chart_teeth.get(13) == "caries"

        # Invoice
        assert any(i["id"] == invoice_id for i in body["invoices"])
        # Financials
        assert body["financials"]["total_billed"] == 50000
        assert body["financials"]["total_paid"] == 20000
        assert body["financials"]["remaining"] == 30000

        # Cleanup invoice
        requests.delete(f"{API}/invoices/{invoice_id}", headers=hdr, timeout=10)


# ------------------------ Booking creates portal_token ------------------------
class TestBookingCreatesPortalToken:
    def test_public_booking_generates_patient_with_portal_token(self, hdr, tenant_id):
        phone = f"07{uuid.uuid4().int % 100000000:08d}"
        # Randomize time to avoid clash on repeated runs
        h = 9 + (uuid.uuid4().int % 8)
        m = "00" if (uuid.uuid4().int % 2 == 0) else "30"
        book = {
            "full_name": f"TEST_Iter5_Book_{uuid.uuid4().hex[:5]}",
            "phone": phone,
            "date": f"20{50 + (uuid.uuid4().int % 40):02d}-12-31",
            "time": f"{h:02d}:{m}",
            "reason": "TEST",
        }
        r = requests.post(f"{API}/public/clinic/{tenant_id}/book", json=book, timeout=10)
        assert r.status_code == 200, r.text

        # Find the newly created patient (auth call)
        plist = requests.get(f"{API}/patients?q=TEST_Iter5_Book_", headers=hdr, timeout=10).json()
        matches = [p for p in plist if p["phone"] == phone]
        assert matches, "booking should have created a patient"
        p = matches[0]
        assert p.get("portal_token"), "booking-created patient must have portal_token"

        # Portal endpoint should work with that token
        r2 = requests.get(f"{API}/public/patient/{p['portal_token']}", timeout=10)
        assert r2.status_code == 200

        # Cleanup: delete patient (and its booking cascade is best-effort)
        requests.delete(f"{API}/patients/{p['id']}", headers=hdr, timeout=10)


# ------------------------ Regressions ------------------------
class TestRegressions:
    def test_invoice_currency_syp_and_usd_persist(self, hdr):
        for cur in ("SYP", "USD"):
            payload = {
                "kind": "expense",
                "date": "2025-01-15",
                "items": [{"description": "TEST_iter5", "quantity": 1, "unit_price": 100}],
                "total": 100, "paid": 100, "currency": cur,
            }
            r = requests.post(f"{API}/invoices", headers=hdr, json=payload, timeout=10)
            assert r.status_code == 200, r.text
            inv_id = r.json()["id"]
            g = requests.get(f"{API}/invoices/{inv_id}", headers=hdr, timeout=10)
            assert g.status_code == 200
            assert g.json()["currency"] == cur
            requests.delete(f"{API}/invoices/{inv_id}", headers=hdr, timeout=10)

    def test_assistant_forbidden_on_invoices_when_financials_hidden(self, hdr, a_hdr):
        # Ensure show_financials_to_assistants is false (default)
        r = requests.get(f"{API}/settings", headers=hdr, timeout=10)
        assert r.status_code == 200
        s = r.json()
        if s.get("show_financials_to_assistants"):
            requests.patch(f"{API}/settings", headers=hdr,
                           json={"show_financials_to_assistants": False}, timeout=10)

        r = requests.get(f"{API}/invoices", headers=a_hdr, timeout=10)
        assert r.status_code == 403, f"expected 403 for assistant, got {r.status_code}"

    def test_chart_persistence_via_get(self, hdr, new_patient):
        pid = new_patient["id"]
        # Set two teeth
        for tooth, cond in [(11, "filling"), (21, "crown")]:
            r = requests.post(f"{API}/patients/{pid}/chart", headers=hdr,
                              json={"tooth": tooth, "condition": cond}, timeout=10)
            assert r.status_code == 200
        g = requests.get(f"{API}/patients/{pid}/chart", headers=hdr, timeout=10)
        assert g.status_code == 200
        chart = {c["tooth"]: c["condition"] for c in g.json()}
        assert chart.get(11) == "filling"
        assert chart.get(21) == "crown"

    def test_partial_patch_preserves_untouched_fields(self, hdr, new_patient):
        pid = new_patient["id"]
        original_name = new_patient["full_name"]
        original_hist = new_patient["medical_history"]

        r = requests.patch(f"{API}/patients/{pid}", headers=hdr,
                           json={"doctor_notes": "note-only-update"}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["doctor_notes"] == "note-only-update"
        assert body["full_name"] == original_name
        assert body["medical_history"] == original_hist
        assert body["allergies"] == new_patient["allergies"]
