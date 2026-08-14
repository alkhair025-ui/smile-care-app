"""
Iteration 2 tests for Eayadati backend:
- Invoice PATCH/DELETE with RBAC
- Public PDF upload + serve
- Public clinic booking portal (info, slots, book, 409)
- Patient doctor_notes persistence
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

DOCTOR = {"email": "doctor@demo.com", "password": "demo1234"}
ASSISTANT = {"email": "assistant@demo.com", "password": "demo1234"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def doctor_data():
    return _login(DOCTOR)


@pytest.fixture(scope="module")
def doctor_token(doctor_data):
    return doctor_data["access_token"]


@pytest.fixture(scope="module")
def tenant_id(doctor_data):
    return doctor_data["user"]["tenant_id"]


@pytest.fixture(scope="module")
def assistant_token():
    return _login(ASSISTANT)["access_token"]


def h(t):
    return {"Authorization": f"Bearer {t}"}


# ------------- Invoice PATCH / DELETE -------------

class TestInvoiceEdit:
    iid = None

    def test_setup_create(self, doctor_token):
        r = requests.post(f"{API}/invoices", json={
            "kind": "patient", "party_name": "TEST_EditParty",
            "items": [{"description": "TEST", "quantity": 1, "unit_price": 100}],
            "total": 100, "paid": 0, "date": "2026-01-20T00:00:00"
        }, headers=h(doctor_token), timeout=30)
        assert r.status_code == 200, r.text
        TestInvoiceEdit.iid = r.json()["id"]

    def test_doctor_patch_invoice(self, doctor_token):
        assert TestInvoiceEdit.iid
        r = requests.patch(f"{API}/invoices/{TestInvoiceEdit.iid}", json={
            "kind": "patient", "party_name": "TEST_EditPartyUpdated",
            "items": [{"description": "TEST", "quantity": 2, "unit_price": 50}],
            "total": 0, "paid": 50, "date": "2026-01-20T00:00:00", "note": "updated"
        }, headers=h(doctor_token), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["party_name"] == "TEST_EditPartyUpdated"
        assert body["total"] == 100.0  # recomputed 2*50
        assert body["paid"] == 50
        # verify persistence
        g = requests.get(f"{API}/invoices/{TestInvoiceEdit.iid}",
                         headers=h(doctor_token), timeout=30).json()
        assert g["party_name"] == "TEST_EditPartyUpdated"
        assert g["paid"] == 50

    def test_assistant_cannot_patch_when_financials_hidden(self, assistant_token, doctor_token):
        # ensure off
        requests.patch(f"{API}/settings", json={"show_financials_to_assistants": False},
                       headers=h(doctor_token), timeout=30)
        r = requests.patch(f"{API}/invoices/{TestInvoiceEdit.iid}", json={
            "kind": "patient", "party_name": "x", "items": [], "total": 1, "paid": 0
        }, headers=h(assistant_token), timeout=30)
        assert r.status_code == 403

    def test_assistant_cannot_delete_invoice(self, assistant_token):
        r = requests.delete(f"{API}/invoices/{TestInvoiceEdit.iid}",
                            headers=h(assistant_token), timeout=30)
        assert r.status_code == 403

    def test_doctor_delete_invoice(self, doctor_token):
        r = requests.delete(f"{API}/invoices/{TestInvoiceEdit.iid}",
                            headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        # verify gone
        g = requests.get(f"{API}/invoices/{TestInvoiceEdit.iid}",
                        headers=h(doctor_token), timeout=30)
        assert g.status_code == 404


# ------------- Public PDF upload + serve -------------

class TestPublicPdf:
    file_id = None
    path = None

    def test_upload_pdf_authed(self, doctor_token):
        # minimal PDF bytes
        pdf = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
               b"2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\nxref\n0 3\n"
               b"0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n"
               b"trailer<</Size 3/Root 1 0 R>>\nstartxref\n95\n%%EOF")
        files = {"file": ("TEST_invoice.pdf", io.BytesIO(pdf), "application/pdf")}
        r = requests.post(f"{API}/uploads/pdf", files=files,
                          headers=h(doctor_token), timeout=120)
        if r.status_code == 500 and "Storage" in r.text:
            pytest.skip(f"Object storage unavailable: {r.text}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "file_id" in body and "path" in body
        assert body["path"].startswith("/api/public/file/")
        TestPublicPdf.file_id = body["file_id"]
        TestPublicPdf.path = body["path"]

    def test_upload_pdf_requires_auth(self):
        files = {"file": ("x.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
        r = requests.post(f"{API}/uploads/pdf", files=files, timeout=30)
        assert r.status_code == 401

    def test_public_file_no_auth(self):
        if not TestPublicPdf.file_id:
            pytest.skip("upload skipped")
        # NO Authorization header
        r = requests.get(f"{API}/public/file/{TestPublicPdf.file_id}", timeout=60)
        assert r.status_code == 200
        assert r.headers.get("Content-Type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF")

    def test_public_file_unknown_404(self):
        r = requests.get(f"{API}/public/file/{uuid.uuid4()}", timeout=30)
        assert r.status_code == 404


# ------------- Public clinic booking portal -------------

class TestPublicPortal:
    def test_public_clinic_no_auth(self, tenant_id):
        r = requests.get(f"{API}/public/clinic/{tenant_id}", timeout=30)
        assert r.status_code == 200
        b = r.json()
        assert b["tenant_id"] == tenant_id
        assert b.get("clinic_name")

    def test_public_clinic_unknown(self):
        r = requests.get(f"{API}/public/clinic/{uuid.uuid4()}", timeout=30)
        assert r.status_code == 404

    def test_public_slots_no_auth_and_shape(self, tenant_id):
        r = requests.get(f"{API}/public/clinic/{tenant_id}/slots",
                         params={"date": "2026-09-02"}, timeout=30)
        assert r.status_code == 200
        b = r.json()
        assert b["date"] == "2026-09-02"
        assert isinstance(b["slots"], list)
        assert len(b["slots"]) == 16  # 9-17 * 2
        assert all("time" in s and "available" in s for s in b["slots"])
        # times sorted
        times = [s["time"] for s in b["slots"]]
        assert times[0] == "09:00" and times[-1] == "16:30"

    def test_public_slots_marks_booked_unavailable(self, tenant_id, doctor_token):
        # book a slot on a fresh date via authed appointments API
        test_date = "2026-09-05"
        test_time = "11:00"
        patients = requests.get(f"{API}/patients", headers=h(doctor_token), timeout=30).json()
        pid = patients[0]["id"]
        appt = requests.post(f"{API}/appointments", json={
            "patient_id": pid, "date": f"{test_date}T{test_time}:00",
            "duration_minutes": 30, "reason": "TEST_SLOT", "status": "scheduled"
        }, headers=h(doctor_token), timeout=30).json()
        try:
            r = requests.get(f"{API}/public/clinic/{tenant_id}/slots",
                             params={"date": test_date}, timeout=30)
            assert r.status_code == 200
            slot = next(s for s in r.json()["slots"] if s["time"] == test_time)
            assert slot["available"] is False
        finally:
            requests.delete(f"{API}/appointments/{appt['id']}",
                            headers=h(doctor_token), timeout=30)

    def test_public_book_creates_patient_and_appointment(self, tenant_id, doctor_token):
        phone = f"+96279{uuid.uuid4().hex[:7]}"
        payload = {"full_name": "TEST_Booker", "phone": phone,
                   "date": "2026-09-10", "time": "10:00", "reason": "TEST"}
        # NO auth header
        r = requests.post(f"{API}/public/clinic/{tenant_id}/book", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # verify patient created (via authed doctor)
        pts = requests.get(f"{API}/patients?q=TEST_Booker",
                          headers=h(doctor_token), timeout=30).json()
        created_p = next((p for p in pts if p.get("phone") == phone), None)
        assert created_p is not None, "patient not created by public booking"

        # verify appointment created with pending status
        appts = requests.get(f"{API}/appointments",
                            headers=h(doctor_token), timeout=30).json()
        appt = next((a for a in appts if a["date"].startswith("2026-09-10T10:00")
                     and a["patient_id"] == created_p["id"]), None)
        assert appt is not None
        assert appt["status"] == "pending"

        # 2nd booking same slot -> 409
        r2 = requests.post(f"{API}/public/clinic/{tenant_id}/book",
                          json={"full_name": "TEST_Booker2", "phone": "+962700000009",
                                "date": "2026-09-10", "time": "10:00", "reason": "x"},
                          timeout=30)
        assert r2.status_code == 409

        # reuse patient by phone: same phone new slot -> should NOT create a duplicate patient
        r3 = requests.post(f"{API}/public/clinic/{tenant_id}/book",
                          json={"full_name": "TEST_Booker Renamed", "phone": phone,
                                "date": "2026-09-10", "time": "12:00", "reason": "x"},
                          timeout=30)
        assert r3.status_code == 200
        pts2 = requests.get(f"{API}/patients?q=TEST_Booker",
                           headers=h(doctor_token), timeout=30).json()
        matches = [p for p in pts2 if p.get("phone") == phone]
        assert len(matches) == 1, "public booking should reuse patient by phone"

        # cleanup
        requests.delete(f"{API}/patients/{created_p['id']}",
                       headers=h(doctor_token), timeout=30)
        for a in appts:
            if a["date"].startswith("2026-09-10T") and a.get("patient_id") == created_p["id"]:
                requests.delete(f"{API}/appointments/{a['id']}",
                               headers=h(doctor_token), timeout=30)
        # clean the 12:00 appt as well
        appts2 = requests.get(f"{API}/appointments",
                             headers=h(doctor_token), timeout=30).json()
        for a in appts2:
            if a["date"].startswith("2026-09-10T"):
                requests.delete(f"{API}/appointments/{a['id']}",
                               headers=h(doctor_token), timeout=30)


# ------------- Patient doctor_notes -------------

class TestDoctorNotes:
    def test_persist_and_read(self, doctor_token):
        # create a patient with doctor_notes
        r = requests.post(f"{API}/patients",
                          json={"full_name": "TEST_Notes", "doctor_notes": "ملاحظة أولية"},
                          headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json().get("doctor_notes") == "ملاحظة أولية"

        # patch doctor_notes
        u = requests.patch(f"{API}/patients/{pid}", json={
            "full_name": "TEST_Notes", "phone": "", "email": "",
            "date_of_birth": "", "gender": "", "address": "",
            "medical_history": "", "allergies": "", "medications": "",
            "notes": "", "doctor_notes": "خطة علاج: حشوة 26 + تنظيف"
        }, headers=h(doctor_token), timeout=30)
        assert u.status_code == 200
        assert u.json()["doctor_notes"] == "خطة علاج: حشوة 26 + تنظيف"

        # GET must return it
        g = requests.get(f"{API}/patients/{pid}", headers=h(doctor_token), timeout=30).json()
        assert g["doctor_notes"] == "خطة علاج: حشوة 26 + تنظيف"

        # cleanup
        requests.delete(f"{API}/patients/{pid}", headers=h(doctor_token), timeout=30)
