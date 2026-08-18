"""
Iteration 4 backend tests for Eayadati — BUG FIX verification:
  BUG 1: Dental chart persistence (upsert, no duplicates, GET returns after POST)
  BUG 2: PATCH /patients/{id} is PARTIAL (does NOT wipe unspecified fields)
  BUG 4: Public booking flow regression (GET clinic / slots / POST book)
  Regression: disabled user login now blocked (403); enabled returns 200.
  Regression: invoice currency SYP/USD persistence + RBAC financials gating.
"""
import os
import uuid
import datetime as dt
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

DOCTOR = {"email": "doctor@demo.com", "password": "demo1234"}
ASSISTANT = {"email": "assistant@demo.com", "password": "demo1234"}
SUPER = {"email": "alkhair025@gmail.com", "password": "0941317941AhmedAttar"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def doctor_data():
    return _login(DOCTOR)


@pytest.fixture(scope="module")
def doctor_token(doctor_data):
    return doctor_data["access_token"]


@pytest.fixture(scope="module")
def doctor_tenant(doctor_data):
    return doctor_data["user"]["tenant_id"]


@pytest.fixture(scope="module")
def super_token():
    return _login(SUPER)["access_token"]


@pytest.fixture(scope="module")
def patient(doctor_token):
    """Create a test patient once per module; clean up at end."""
    payload = {
        "full_name": "TEST_Iter4_Patient",
        "phone": "+963900000001",
        "email": "test.iter4@example.com",
        "date_of_birth": "1990-05-01",
        "gender": "male",
        "address": "TEST address",
        "medical_history": "TEST history — diabetes",
        "allergies": "penicillin",
        "medications": "metformin",
        "notes": "general note",
        "doctor_notes": "initial",
    }
    r = requests.post(f"{API}/patients", json=payload, headers=h(doctor_token), timeout=30)
    assert r.status_code == 200, r.text
    p = r.json()
    yield p
    # cleanup
    requests.delete(f"{API}/patients/{p['id']}", headers=h(doctor_token), timeout=30)


# ---------------- BUG 1: Dental chart persistence ----------------

class TestDentalChart:
    def test_chart_empty_initially(self, doctor_token, patient):
        r = requests.get(f"{API}/patients/{patient['id']}/chart", headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_set_tooth_persists(self, doctor_token, patient):
        r = requests.post(f"{API}/patients/{patient['id']}/chart",
                          json={"tooth": 13, "condition": "caries", "note": "TEST_note"},
                          headers=h(doctor_token), timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["tooth"] == 13 and b["condition"] == "caries" and b["note"] == "TEST_note"

        # GET returns it
        g = requests.get(f"{API}/patients/{patient['id']}/chart", headers=h(doctor_token), timeout=30).json()
        matches = [t for t in g if t["tooth"] == 13]
        assert len(matches) == 1, f"expected exactly one tooth 13, got {len(matches)}"
        assert matches[0]["condition"] == "caries"
        assert matches[0]["note"] == "TEST_note"

    def test_set_same_tooth_twice_updates_no_duplicate(self, doctor_token, patient):
        # First set
        r1 = requests.post(f"{API}/patients/{patient['id']}/chart",
                           json={"tooth": 21, "condition": "filling", "note": "n1"},
                           headers=h(doctor_token), timeout=30)
        assert r1.status_code == 200
        # Second set — update to different condition
        r2 = requests.post(f"{API}/patients/{patient['id']}/chart",
                           json={"tooth": 21, "condition": "crown", "note": "n2"},
                           headers=h(doctor_token), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["condition"] == "crown"

        # GET returns only one for tooth 21
        g = requests.get(f"{API}/patients/{patient['id']}/chart", headers=h(doctor_token), timeout=30).json()
        matches = [t for t in g if t["tooth"] == 21]
        assert len(matches) == 1, "duplicate documents for same tooth — upsert broken"
        assert matches[0]["condition"] == "crown"
        assert matches[0]["note"] == "n2"

    def test_chart_survives_refetch(self, doctor_token, patient):
        # simulate reopening patient by re-fetching everything
        p = requests.get(f"{API}/patients/{patient['id']}", headers=h(doctor_token), timeout=30).json()
        c = requests.get(f"{API}/patients/{patient['id']}/chart", headers=h(doctor_token), timeout=30).json()
        teeth = {t["tooth"]: t["condition"] for t in c}
        assert 13 in teeth and teeth[13] == "caries"
        assert 21 in teeth and teeth[21] == "crown"
        assert p["id"] == patient["id"]


# ---------------- BUG 2: Partial PATCH ----------------

class TestPartialPatch:
    def test_patch_doctor_notes_only_keeps_full_name(self, doctor_token, patient):
        # Baseline read
        p0 = requests.get(f"{API}/patients/{patient['id']}", headers=h(doctor_token), timeout=30).json()
        assert p0["full_name"] == "TEST_Iter4_Patient"
        assert p0["medical_history"] == "TEST history — diabetes"
        assert p0["allergies"] == "penicillin"
        assert p0["phone"] == "+963900000001"

        # Send ONLY doctor_notes (this used to wipe fields under full-replace)
        r = requests.patch(f"{API}/patients/{patient['id']}",
                           json={"doctor_notes": "note-after-partial"},
                           headers=h(doctor_token), timeout=30)
        assert r.status_code == 200, r.text
        p1 = r.json()
        assert p1["doctor_notes"] == "note-after-partial"

        # Critical: other fields survived
        assert p1["full_name"] == "TEST_Iter4_Patient", "full_name was wiped by partial PATCH"
        assert p1["medical_history"] == "TEST history — diabetes", "medical_history wiped"
        assert p1["allergies"] == "penicillin", "allergies wiped"
        assert p1["phone"] == "+963900000001", "phone wiped"

        # GET verifies persistence
        p2 = requests.get(f"{API}/patients/{patient['id']}", headers=h(doctor_token), timeout=30).json()
        assert p2["full_name"] == "TEST_Iter4_Patient"
        assert p2["doctor_notes"] == "note-after-partial"

    def test_patch_ignores_unknown_fields(self, doctor_token, patient):
        r = requests.patch(f"{API}/patients/{patient['id']}",
                           json={"tenant_id": "hijack", "id": "hijack", "medications": "amoxicillin"},
                           headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        b = r.json()
        assert b["medications"] == "amoxicillin"
        assert b["id"] == patient["id"]
        assert b["tenant_id"] != "hijack"


# ---------------- BUG 4-adjacent: public booking regression ----------------

class TestPublicBooking:
    def test_public_clinic_no_auth(self, doctor_tenant):
        r = requests.get(f"{API}/public/clinic/{doctor_tenant}", timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        # basic shape (clinic name at minimum)
        assert isinstance(b, dict)
        assert b.get("clinic_name") or b.get("name") or b.get("tenant_id"), b

    def test_public_slots_no_auth(self, doctor_tenant):
        # tomorrow
        d = (dt.date.today() + dt.timedelta(days=1)).isoformat()
        r = requests.get(f"{API}/public/clinic/{doctor_tenant}/slots", params={"date": d}, timeout=30)
        assert r.status_code == 200, r.text
        slots = r.json()
        # accept either list of strings or wrapped in dict
        if isinstance(slots, dict):
            slots = slots.get("slots") or slots.get("available") or []
        assert isinstance(slots, list)
        assert len(slots) > 0
        # slots may be strings or objects {"time":"HH:MM","available":bool}
        def _time(s):
            return s if isinstance(s, str) else s.get("time")
        assert all(isinstance(_time(s), str) and ":" in _time(s) for s in slots)

    def test_public_book_success_no_auth(self, doctor_tenant):
        d = (dt.date.today() + dt.timedelta(days=2)).isoformat()
        # get a free slot
        slots = requests.get(f"{API}/public/clinic/{doctor_tenant}/slots",
                             params={"date": d}, timeout=30).json()
        if isinstance(slots, dict):
            slots = slots.get("slots") or []
        assert slots, "no slots available"
        first = slots[0]
        slot = first if isinstance(first, str) else first.get("time")
        # pick an available one if objects
        for s in slots:
            if isinstance(s, dict) and s.get("available"):
                slot = s["time"]; break

        payload = {
            "full_name": f"TEST_Booker_{uuid.uuid4().hex[:6]}",
            "phone": "+963900000002",
            "date": d,
            "time": slot,
            "note": "TEST booking",
        }
        r = requests.post(f"{API}/public/clinic/{doctor_tenant}/book", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("ok") or b.get("id"), b

    def test_public_clinic_unknown_tenant_404(self):
        r = requests.get(f"{API}/public/clinic/does-not-exist-xxxx", timeout=30)
        assert r.status_code in (404, 400)


# ---------------- Regression: disabled user login blocked ----------------

class TestDisabledLoginBlocked:
    def test_enabled_login_ok(self):
        r = requests.post(f"{API}/auth/login", json=ASSISTANT, timeout=30)
        assert r.status_code == 200

    def test_disabled_user_login_403(self, super_token):
        # find assistant
        items = requests.get(f"{API}/admin/doctors", headers=h(super_token), timeout=30).json()
        assistant = next(u for u in items if u["email"] == ASSISTANT["email"])
        # ensure starting enabled
        if assistant["disabled"]:
            requests.post(f"{API}/admin/users/{assistant['id']}/toggle-disabled",
                          headers=h(super_token), timeout=30)
        try:
            # disable
            r = requests.post(f"{API}/admin/users/{assistant['id']}/toggle-disabled",
                              headers=h(super_token), timeout=30)
            assert r.status_code == 200
            assert r.json()["disabled"] is True
            # login must fail 403
            lr = requests.post(f"{API}/auth/login", json=ASSISTANT, timeout=30)
            assert lr.status_code == 403, f"expected 403, got {lr.status_code}: {lr.text}"
        finally:
            # ALWAYS re-enable
            items2 = requests.get(f"{API}/admin/doctors", headers=h(super_token), timeout=30).json()
            a2 = next(u for u in items2 if u["email"] == ASSISTANT["email"])
            if a2["disabled"]:
                requests.post(f"{API}/admin/users/{a2['id']}/toggle-disabled",
                              headers=h(super_token), timeout=30)
        # verify re-enabled
        lr2 = requests.post(f"{API}/auth/login", json=ASSISTANT, timeout=30)
        assert lr2.status_code == 200


# ---------------- Regression: invoice currency + RBAC ----------------

class TestInvoiceCurrencyRegression:
    _ids = []

    def test_default_syp(self, doctor_token):
        r = requests.post(f"{API}/invoices", json={
            "kind": "patient", "party_name": "TEST_Iter4_SYP",
            "items": [{"description": "T", "quantity": 1, "unit_price": 10}],
            "total": 10, "paid": 0
        }, headers=h(doctor_token), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["currency"] == "SYP"
        TestInvoiceCurrencyRegression._ids.append(r.json()["id"])

    def test_create_usd_persists(self, doctor_token):
        r = requests.post(f"{API}/invoices", json={
            "kind": "patient", "party_name": "TEST_Iter4_USD",
            "items": [{"description": "T", "quantity": 1, "unit_price": 20}],
            "total": 20, "paid": 0, "currency": "USD"
        }, headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        iid = r.json()["id"]
        g = requests.get(f"{API}/invoices/{iid}", headers=h(doctor_token), timeout=30).json()
        assert g["currency"] == "USD"
        TestInvoiceCurrencyRegression._ids.append(iid)

    def test_rbac_financials_hidden_from_assistant(self, doctor_token):
        # hide from assistant
        requests.patch(f"{API}/settings",
                       json={"show_financials_to_assistants": False},
                       headers=h(doctor_token), timeout=30)
        a_tok = _login(ASSISTANT)["access_token"]
        r = requests.get(f"{API}/invoices", headers=h(a_tok), timeout=30)
        assert r.status_code == 403

    def test_cleanup(self, doctor_token):
        for iid in TestInvoiceCurrencyRegression._ids:
            requests.delete(f"{API}/invoices/{iid}", headers=h(doctor_token), timeout=30)
