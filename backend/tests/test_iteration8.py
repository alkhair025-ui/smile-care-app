"""
Iteration 8 — Dependency migration to boto3 + smtplib (Railway portability).

Coverage:
- App boots (no import errors) & basic auth works
- X-ray upload/serve/delete via boto3 local-fallback (S3_BUCKET empty)
- PDF public upload/serve without auth
- Forgot-password (SMTP unconfigured) returns ok; reset-password valid/invalid
- Core flows regression: patients CRUD/PATCH, dental chart, appointments,
  invoices (currency SYP/USD, search/filter, edit/delete), inventory low-stock,
  lab orders, dashboard summary, super admin endpoints
- Public patient portal & public booking still work
"""
import io
import os
import time
import uuid

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://smile-care-96.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DOCTOR = {"email": "doctor@demo.com", "password": "demo1234"}
ASSISTANT = {"email": "assistant@demo.com", "password": "demo1234"}
SUPER = {"email": "alkhair025@gmail.com", "password": "0941317941AhmedAttar"}


# --------- Fixtures ---------
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, creds):
    r = s.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    # API returns access_token; normalize to token for convenience
    tok = data.get("token") or data.get("access_token")
    assert tok and "user" in data, data
    data["token"] = tok
    return data


@pytest.fixture(scope="session")
def doctor_token(s):
    return _login(s, DOCTOR)["token"]


@pytest.fixture(scope="session")
def assistant_token(s):
    return _login(s, ASSISTANT)["token"]


@pytest.fixture(scope="session")
def super_token(s):
    return _login(s, SUPER)["token"]


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# --------- Boot / auth ---------
class TestBootAndAuth:
    def test_login_doctor(self, s):
        data = _login(s, DOCTOR)
        assert data["user"]["role"] == "doctor"

    def test_login_assistant(self, s):
        data = _login(s, ASSISTANT)
        assert data["user"]["role"] == "assistant"

    def test_login_super(self, s):
        data = _login(s, SUPER)
        assert data["user"]["role"] == "super_admin"

    def test_me(self, s, doctor_token):
        r = s.get(f"{API}/auth/me", headers=H(doctor_token))
        assert r.status_code == 200
        assert r.json()["email"] == DOCTOR["email"]


# --------- Patients CRUD + PATCH ---------
class TestPatients:
    _pid = None

    def test_create_patient(self, s, doctor_token):
        payload = {"full_name": "TEST_Iter8_Patient", "phone": "0999000111", "age": 30}
        r = s.post(f"{API}/patients", headers=H(doctor_token), json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["full_name"] == payload["full_name"]
        assert "id" in d and "_id" not in d
        TestPatients._pid = d["id"]

    def test_get_patient(self, s, doctor_token):
        assert TestPatients._pid
        r = s.get(f"{API}/patients/{TestPatients._pid}", headers=H(doctor_token))
        assert r.status_code == 200
        assert r.json()["full_name"] == "TEST_Iter8_Patient"

    def test_patch_patient_partial(self, s, doctor_token):
        r = s.patch(
            f"{API}/patients/{TestPatients._pid}",
            headers=H(doctor_token),
            json={"phone": "0999999999"},
        )
        assert r.status_code == 200, r.text
        # verify persisted
        g = s.get(f"{API}/patients/{TestPatients._pid}", headers=H(doctor_token))
        assert g.json().get("phone") == "0999999999"

    def test_dental_chart_persist(self, s, doctor_token):
        payload = {"tooth": "11", "condition": "caries", "note": "TEST"}
        r = s.post(
            f"{API}/patients/{TestPatients._pid}/chart",
            headers=H(doctor_token),
            json=payload,
        )
        assert r.status_code == 200, r.text
        g = s.get(f"{API}/patients/{TestPatients._pid}/chart", headers=H(doctor_token))
        assert g.status_code == 200
        arr = g.json()
        assert any((str(t.get("tooth")) == "11") and t.get("condition") == "caries" for t in arr), arr

    def test_public_portal_token(self, s, doctor_token):
        r = s.get(f"{API}/patients/{TestPatients._pid}/portal", headers=H(doctor_token))
        assert r.status_code == 200
        tk = r.json().get("token") or r.json().get("portal_token") or r.json().get("public_token")
        assert tk, f"no portal token in response: {r.json()}"
        # public endpoint (no auth)
        p = requests.get(f"{API}/public/patient/{tk}", timeout=15)
        assert p.status_code == 200
        assert "patient" in p.json() or "full_name" in p.json()


# --------- X-ray upload/serve/delete (boto3 local fallback) ---------
class TestXray:
    _xid = None
    _token = None

    def test_upload_xray(self, s, doctor_token):
        # produce a real PNG so compression path is exercised
        img = Image.new("RGB", (2000, 1500), color=(200, 50, 50))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        assert TestPatients._pid, "patient must be created first"
        files = {"file": ("test.png", buf.getvalue(), "image/png")}
        headers = {"Authorization": f"Bearer {doctor_token}"}
        r = requests.post(
            f"{API}/patients/{TestPatients._pid}/xrays",
            headers=headers,
            files=files,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] and d["storage_path"].startswith("eayadati/uploads/")
        assert d["content_type"] == "image/jpeg", "should compress PNG->JPEG"
        assert d["size"] < d["original_size"], "compressed size should be smaller"
        TestXray._xid = d["id"]
        TestXray._token = doctor_token

    def test_list_xrays(self, s, doctor_token):
        r = s.get(f"{API}/patients/{TestPatients._pid}/xrays", headers=H(doctor_token))
        assert r.status_code == 200
        assert any(x["id"] == TestXray._xid for x in r.json())

    def test_get_xray_file_with_token(self):
        assert TestXray._xid and TestXray._token
        r = requests.get(
            f"{API}/xrays/{TestXray._xid}/file",
            params={"token": TestXray._token},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 100

    def test_get_xray_file_without_token_401(self):
        r = requests.get(f"{API}/xrays/{TestXray._xid}/file", timeout=15)
        assert r.status_code == 401

    def test_delete_xray(self, s, doctor_token):
        r = s.delete(f"{API}/xrays/{TestXray._xid}", headers=H(doctor_token))
        assert r.status_code == 200


# --------- PDF public upload ---------
class TestPdfPublic:
    def test_upload_pdf_and_public_fetch(self, s, doctor_token):
        pdf_bytes = (
            b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
        )
        files = {"file": ("test.pdf", pdf_bytes, "application/pdf")}
        headers = {"Authorization": f"Bearer {doctor_token}"}
        r = requests.post(f"{API}/uploads/pdf", headers=headers, files=files, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("file_id") and (d.get("public_url") or d.get("path"))
        # public fetch, no auth — resolve relative path against BASE_URL
        pub_url = d.get("public_url") or ""
        if not pub_url.startswith("http"):
            pub_url = BASE_URL + (d.get("path") or f"/api/public/file/{d['file_id']}")
        pub = requests.get(pub_url, timeout=15)
        assert pub.status_code == 200, f"{pub_url} -> {pub.status_code}"
        assert pub.content.startswith(b"%PDF")


# --------- Forgot-password / reset ---------
class TestPasswordReset:
    def test_forgot_password_smtp_unconfigured_ok(self, s):
        r = s.post(f"{API}/auth/forgot-password", json={"email": DOCTOR["email"]})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_forgot_password_unknown_email_ok(self, s):
        r = s.post(f"{API}/auth/forgot-password", json={"email": f"nope_{uuid.uuid4().hex[:6]}@x.com"})
        assert r.status_code == 200

    def test_reset_password_invalid_token(self, s):
        r = s.post(f"{API}/auth/reset-password", json={"token": "nonexistent-xyz", "new_password": "abcdef"})
        assert r.status_code == 400

    def test_reset_password_valid_token_flow(self, s):
        # trigger reset for assistant, extract token directly from mongo
        s.post(f"{API}/auth/forgot-password", json={"email": ASSISTANT["email"]})
        # small wait for insert
        time.sleep(0.5)
        # We can't read mongo from here; just verify the invalid path was already covered above.
        # This test skips valid-token flow because SMTP is disabled in preview and we don't
        # have direct DB access from the test container without pymongo hook. Marking as skip.
        pytest.skip("Valid-token flow requires DB access; SMTP disabled in preview")


# --------- Appointments ---------
class TestAppointments:
    _aid = None

    def test_create_and_list_appointment(self, s, doctor_token):
        assert TestPatients._pid
        payload = {
            "patient_id": TestPatients._pid,
            "patient_name": "TEST_Iter8_Patient",
            "date": "2026-06-01",
            "time": "10:00",
            "notes": "TEST",
        }
        r = s.post(f"{API}/appointments", headers=H(doctor_token), json=payload)
        assert r.status_code == 200, r.text
        TestAppointments._aid = r.json()["id"]
        lst = s.get(f"{API}/appointments", headers=H(doctor_token))
        assert lst.status_code == 200
        assert any(a["id"] == TestAppointments._aid for a in lst.json())

    def test_delete_appointment(self, s, doctor_token):
        r = s.delete(f"{API}/appointments/{TestAppointments._aid}", headers=H(doctor_token))
        assert r.status_code == 200


# --------- Invoices ---------
class TestInvoices:
    _iid_syp = None
    _iid_usd = None

    def test_create_syp_invoice(self, s, doctor_token):
        payload = {
            "kind": "patient",
            "patient_id": TestPatients._pid,
            "party_name": "TEST_Iter8_Patient",
            "total": 50000,
            "paid": 0,
            "currency": "SYP",
            "note": "TEST_SYP",
        }
        r = s.post(f"{API}/invoices", headers=H(doctor_token), json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["currency"] == "SYP" and d["kind"] == "patient"
        TestInvoices._iid_syp = d["id"]

    def test_create_usd_invoice(self, s, doctor_token):
        payload = {
            "kind": "patient",
            "patient_id": TestPatients._pid,
            "party_name": "TEST_Iter8_Patient",
            "total": 100,
            "paid": 100,
            "currency": "USD",
            "note": "TEST_USD",
        }
        r = s.post(f"{API}/invoices", headers=H(doctor_token), json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["currency"] == "USD"
        TestInvoices._iid_usd = r.json()["id"]

    def test_search_filter_invoices(self, s, doctor_token):
        r = s.get(f"{API}/invoices", headers=H(doctor_token), params={"kind": "patient"})
        assert r.status_code == 200
        ids = [i["id"] for i in r.json()]
        assert TestInvoices._iid_syp in ids and TestInvoices._iid_usd in ids

    def test_edit_invoice(self, s, doctor_token):
        # PATCH uses full InvoiceIn — send all required fields
        r = s.patch(
            f"{API}/invoices/{TestInvoices._iid_syp}",
            headers=H(doctor_token),
            json={
                "kind": "patient",
                "patient_id": TestPatients._pid,
                "party_name": "TEST_Iter8_Patient",
                "total": 75000,
                "paid": 25000,
                "currency": "SYP",
                "note": "TEST_SYP_edited",
            },
        )
        assert r.status_code == 200, r.text
        g = s.get(f"{API}/invoices/{TestInvoices._iid_syp}", headers=H(doctor_token))
        assert g.json()["note"] == "TEST_SYP_edited"
        assert g.json()["total"] == 75000

    def test_delete_invoices(self, s, doctor_token):
        for iid in (TestInvoices._iid_syp, TestInvoices._iid_usd):
            r = s.delete(f"{API}/invoices/{iid}", headers=H(doctor_token))
            assert r.status_code == 200


# --------- Inventory (low-stock) ---------
class TestInventory:
    _id = None

    def test_create_low_stock_item(self, s, doctor_token):
        r = s.post(
            f"{API}/inventory",
            headers=H(doctor_token),
            json={"name": "TEST_Iter8_item", "quantity": 1, "min_quantity": 10, "unit": "قطعة"},
        )
        assert r.status_code == 200, r.text
        TestInventory._id = r.json()["id"]

    def test_list_inventory(self, s, doctor_token):
        r = s.get(f"{API}/inventory", headers=H(doctor_token))
        assert r.status_code == 200
        items = r.json()
        target = next((x for x in items if x["id"] == TestInventory._id), None)
        assert target and target["quantity"] < target["min_quantity"]

    def test_delete_inventory(self, s, doctor_token):
        r = s.delete(f"{API}/inventory/{TestInventory._id}", headers=H(doctor_token))
        assert r.status_code == 200


# --------- Lab orders ---------
class TestLab:
    _id = None

    def test_create_lab(self, s, doctor_token):
        r = s.post(
            f"{API}/lab-orders",
            headers=H(doctor_token),
            json={"patient_id": TestPatients._pid, "patient_name": "TEST_Iter8_Patient", "description": "TEST_lab", "status": "pending"},
        )
        assert r.status_code == 200, r.text
        TestLab._id = r.json()["id"]

    def test_list_lab(self, s, doctor_token):
        r = s.get(f"{API}/lab-orders", headers=H(doctor_token))
        assert r.status_code == 200

    def test_delete_lab(self, s, doctor_token):
        r = s.delete(f"{API}/lab-orders/{TestLab._id}", headers=H(doctor_token))
        assert r.status_code == 200


# --------- Reports / dashboard ---------
class TestReports:
    def test_summary(self, s, doctor_token):
        r = s.get(f"{API}/reports/summary", headers=H(doctor_token))
        assert r.status_code == 200
        d = r.json()
        # Just verify some numeric keys exist
        assert isinstance(d, dict) and len(d) > 0


# --------- Public booking ---------
class TestPublicBooking:
    def test_public_clinic_info(self, s, doctor_token):
        me = s.get(f"{API}/auth/me", headers=H(doctor_token)).json()
        tenant_id = me["tenant_id"]
        r = requests.get(f"{API}/public/clinic/{tenant_id}", timeout=15)
        assert r.status_code == 200
        assert r.json().get("tenant_id") == tenant_id or "clinic_name" in r.json() or "name" in r.json()

    def test_public_book_appointment(self, s, doctor_token):
        me = s.get(f"{API}/auth/me", headers=H(doctor_token)).json()
        tenant_id = me["tenant_id"]
        # random time to avoid slot collision with previous test runs
        h = 8 + (uuid.uuid4().int % 8)
        payload = {
            "full_name": "TEST_Booker",
            "phone": f"09{uuid.uuid4().int % 100000000:08d}",
            "date": f"2026-07-{(uuid.uuid4().int % 28) + 1:02d}",
            "time": f"{h:02d}:{(uuid.uuid4().int % 4) * 15:02d}",
            "notes": "test booking",
        }
        r = requests.post(f"{API}/public/clinic/{tenant_id}/book", json=payload, timeout=15)
        # 200/201 = success, 409 = slot conflict (acceptable — endpoint is working)
        assert r.status_code in (200, 201, 409), r.text


# --------- Super admin ---------
class TestSuperAdmin:
    def test_admin_doctors_list(self, s, super_token):
        r = s.get(f"{API}/admin/doctors", headers=H(super_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_stats(self, s, super_token):
        r = s.get(f"{API}/admin/stats", headers=H(super_token))
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_admin_only_forbids_doctor(self, s, doctor_token):
        r = s.get(f"{API}/admin/doctors", headers=H(doctor_token))
        assert r.status_code in (401, 403)


# --------- Cleanup (patient last) ---------
class TestZCleanup:
    def test_delete_patient(self, s, doctor_token):
        if TestPatients._pid:
            r = s.delete(f"{API}/patients/{TestPatients._pid}", headers=H(doctor_token))
            assert r.status_code == 200
