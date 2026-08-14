"""
Eayadati (عيادتي) backend regression tests.
Covers auth, RBAC financials gating, patients CRUD, chart, xrays, appointments,
invoices, inventory, lab orders, dashboard summary, assistant management.
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

DOCTOR = {"email": "doctor@demo.com", "password": "demo1234"}
ASSISTANT = {"email": "assistant@demo.com", "password": "demo1234"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def doctor_token():
    return _login(DOCTOR)["access_token"]


@pytest.fixture(scope="session")
def assistant_token():
    return _login(ASSISTANT)["access_token"]


def h(token):
    return {"Authorization": f"Bearer {token}"}


# ------------- Auth -------------

class TestAuth:
    def test_login_doctor(self):
        data = _login(DOCTOR)
        assert data["token_type"] == "bearer"
        assert data["user"]["role"] == "doctor"
        assert data["user"]["email"] == DOCTOR["email"]

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": DOCTOR["email"], "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_requires_token(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_doctor(self, doctor_token):
        r = requests.get(f"{API}/auth/me", headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        u = r.json()
        assert u["role"] == "doctor"
        assert u["tenant_id"]
        assert "show_financials_to_assistants" in u

    def test_register_new_doctor(self):
        email = f"TEST_dr_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "test1234",
            "full_name": "TEST Doctor", "clinic_name": "TEST Clinic"
        }, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "doctor"
        assert data["user"]["clinic_name"] == "TEST Clinic"

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": DOCTOR["email"], "password": "demo1234",
            "full_name": "x", "clinic_name": "x"
        }, timeout=30)
        assert r.status_code == 409


# ------------- RBAC financial gating -------------

class TestFinancialsGating:
    def test_reset_settings_off(self, doctor_token):
        r = requests.patch(f"{API}/settings",
                           json={"show_financials_to_assistants": False},
                           headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        assert r.json().get("show_financials_to_assistants") is False

    def test_doctor_can_view_invoices(self, doctor_token):
        r = requests.get(f"{API}/invoices", headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_assistant_blocked_when_off(self, assistant_token, doctor_token):
        # Ensure off
        requests.patch(f"{API}/settings", json={"show_financials_to_assistants": False},
                       headers=h(doctor_token), timeout=30)
        r = requests.get(f"{API}/invoices", headers=h(assistant_token), timeout=30)
        assert r.status_code == 403

    def test_assistant_allowed_when_on(self, assistant_token, doctor_token):
        r = requests.patch(f"{API}/settings", json={"show_financials_to_assistants": True},
                           headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/invoices", headers=h(assistant_token), timeout=30)
        assert r.status_code == 200
        # revert
        requests.patch(f"{API}/settings", json={"show_financials_to_assistants": False},
                       headers=h(doctor_token), timeout=30)

    def test_assistant_cannot_patch_settings(self, assistant_token):
        r = requests.patch(f"{API}/settings", json={"show_financials_to_assistants": True},
                           headers=h(assistant_token), timeout=30)
        assert r.status_code == 403


# ------------- Patients CRUD -------------

class TestPatients:
    created_id = None

    def test_list_patients(self, doctor_token):
        r = requests.get(f"{API}/patients", headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert len(arr) >= 3  # seeded

    def test_create_patient(self, doctor_token):
        payload = {"full_name": "TEST_Patient X", "phone": "+962700000000",
                   "date_of_birth": "1990-01-01", "gender": "ذكر"}
        r = requests.post(f"{API}/patients", json=payload, headers=h(doctor_token), timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["full_name"] == "TEST_Patient X"
        TestPatients.created_id = p["id"]

    def test_get_patient(self, doctor_token):
        assert TestPatients.created_id
        r = requests.get(f"{API}/patients/{TestPatients.created_id}",
                         headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["full_name"] == "TEST_Patient X"

    def test_search_patients(self, doctor_token):
        r = requests.get(f"{API}/patients?q=TEST_Patient",
                         headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        assert any(p["full_name"] == "TEST_Patient X" for p in r.json())

    def test_update_patient(self, doctor_token):
        r = requests.patch(f"{API}/patients/{TestPatients.created_id}",
                           json={"full_name": "TEST_Patient X2", "phone": "+962700000001",
                                 "email": "", "date_of_birth": "", "gender": "",
                                 "address": "", "medical_history": "", "allergies": "",
                                 "medications": "", "notes": ""},
                           headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["full_name"] == "TEST_Patient X2"

    def test_dental_chart_upsert(self, doctor_token):
        pid = TestPatients.created_id
        r = requests.post(f"{API}/patients/{pid}/chart",
                          json={"tooth": 26, "condition": "caries", "note": "test"},
                          headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/patients/{pid}/chart",
                          headers=h(doctor_token), timeout=30)
        assert r2.status_code == 200
        assert any(t["tooth"] == 26 and t["condition"] == "caries" for t in r2.json())

    def test_delete_patient(self, doctor_token):
        r = requests.delete(f"{API}/patients/{TestPatients.created_id}",
                            headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/patients/{TestPatients.created_id}",
                          headers=h(doctor_token), timeout=30)
        assert r2.status_code == 404


# ------------- X-rays -------------

class TestXrays:
    def test_upload_and_fetch(self, doctor_token):
        # create a patient
        pr = requests.post(f"{API}/patients",
                           json={"full_name": "TEST_XR"}, headers=h(doctor_token), timeout=30)
        pid = pr.json()["id"]
        # 1x1 transparent PNG
        import base64
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/patients/{pid}/xrays", files=files,
                          headers=h(doctor_token), timeout=120)
        # storage may not be available in test env; if 500 skip
        if r.status_code == 500:
            pytest.skip(f"Object storage unavailable: {r.text}")
        assert r.status_code == 200, r.text
        xid = r.json()["id"]
        # list
        lr = requests.get(f"{API}/patients/{pid}/xrays",
                          headers=h(doctor_token), timeout=30)
        assert lr.status_code == 200
        assert any(x["id"] == xid for x in lr.json())
        # fetch with token
        fr = requests.get(f"{API}/xrays/{xid}/file?token={doctor_token}", timeout=60)
        assert fr.status_code == 200
        assert fr.headers.get("Content-Type", "").startswith("image/")
        # cleanup
        requests.delete(f"{API}/xrays/{xid}", headers=h(doctor_token), timeout=30)
        requests.delete(f"{API}/patients/{pid}", headers=h(doctor_token), timeout=30)


# ------------- Appointments -------------

class TestAppointments:
    aid = None

    def test_list(self, doctor_token):
        r = requests.get(f"{API}/appointments", headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create(self, doctor_token):
        # need patient
        patients = requests.get(f"{API}/patients", headers=h(doctor_token), timeout=30).json()
        pid = patients[0]["id"]
        r = requests.post(f"{API}/appointments", json={
            "patient_id": pid, "date": "2026-02-01T10:00:00",
            "duration_minutes": 30, "reason": "TEST", "status": "scheduled"
        }, headers=h(doctor_token), timeout=30)
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["patient_id"] == pid
        assert a.get("patient_name")  # backfilled
        TestAppointments.aid = a["id"]

    def test_update(self, doctor_token):
        r = requests.patch(f"{API}/appointments/{TestAppointments.aid}", json={
            "patient_id": "", "date": "2026-02-01T11:00:00",
            "duration_minutes": 45, "reason": "TEST2", "status": "confirmed"
        }, headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "confirmed"

    def test_delete(self, doctor_token):
        r = requests.delete(f"{API}/appointments/{TestAppointments.aid}",
                            headers=h(doctor_token), timeout=30)
        assert r.status_code == 200


# ------------- Invoices -------------

class TestInvoices:
    iid = None

    def test_create_patient_invoice(self, doctor_token):
        r = requests.post(f"{API}/invoices", json={
            "kind": "patient", "party_name": "TEST_Party",
            "items": [{"description": "TEST", "quantity": 2, "unit_price": 25}],
            "total": 0, "paid": 0, "date": "2026-01-15T00:00:00"
        }, headers=h(doctor_token), timeout=30)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["total"] == 50.0  # computed from items
        TestInvoices.iid = inv["id"]

    def test_list_by_kind(self, doctor_token):
        r = requests.get(f"{API}/invoices?kind=patient",
                         headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        assert all(i["kind"] == "patient" for i in r.json())

    def test_get_invoice(self, doctor_token):
        r = requests.get(f"{API}/invoices/{TestInvoices.iid}",
                         headers=h(doctor_token), timeout=30)
        assert r.status_code == 200

    def test_assistant_cannot_create(self, assistant_token, doctor_token):
        # ensure off
        requests.patch(f"{API}/settings", json={"show_financials_to_assistants": False},
                       headers=h(doctor_token), timeout=30)
        r = requests.post(f"{API}/invoices", json={"kind": "expense", "total": 5},
                          headers=h(assistant_token), timeout=30)
        assert r.status_code == 403

    def test_delete_invoice(self, doctor_token):
        r = requests.delete(f"{API}/invoices/{TestInvoices.iid}",
                            headers=h(doctor_token), timeout=30)
        assert r.status_code == 200


# ------------- Inventory -------------

class TestInventory:
    def test_crud_and_low_stock(self, doctor_token):
        r = requests.post(f"{API}/inventory", json={
            "name": "TEST_ITEM", "unit": "قطعة", "quantity": 1,
            "min_quantity": 5, "unit_price": 10, "category": "TEST"
        }, headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        iid = r.json()["id"]
        # summary low_stock_count includes it
        s = requests.get(f"{API}/reports/summary", headers=h(doctor_token), timeout=30).json()
        assert s["low_stock_count"] >= 1
        # update
        u = requests.patch(f"{API}/inventory/{iid}", json={
            "name": "TEST_ITEM", "unit": "قطعة", "quantity": 20,
            "min_quantity": 5, "unit_price": 10, "category": "TEST"
        }, headers=h(doctor_token), timeout=30)
        assert u.status_code == 200
        assert u.json()["quantity"] == 20
        requests.delete(f"{API}/inventory/{iid}", headers=h(doctor_token), timeout=30)


# ------------- Lab Orders -------------

class TestLabOrders:
    def test_crud(self, doctor_token):
        r = requests.post(f"{API}/lab-orders", json={
            "patient_name": "TEST_LabPatient", "lab_name": "TEST_Lab",
            "description": "TEST", "status": "sent", "cost": 100, "paid": 0
        }, headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        lid = r.json()["id"]
        r2 = requests.patch(f"{API}/lab-orders/{lid}", json={
            "patient_name": "TEST_LabPatient", "lab_name": "TEST_Lab",
            "description": "TEST", "status": "received", "cost": 100, "paid": 50
        }, headers=h(doctor_token), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["status"] == "received"
        r3 = requests.get(f"{API}/lab-orders", headers=h(doctor_token), timeout=30)
        assert any(x["id"] == lid for x in r3.json())
        requests.delete(f"{API}/lab-orders/{lid}", headers=h(doctor_token), timeout=30)


# ------------- Dashboard Summary -------------

class TestSummary:
    def test_doctor_summary_includes_financials(self, doctor_token):
        r = requests.get(f"{API}/reports/summary", headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        s = r.json()
        assert s["financials_visible"] is True
        for k in ("revenue", "purchases", "salaries", "expenses", "net_profit", "monthly"):
            assert k in s
        assert isinstance(s["monthly"], list) and len(s["monthly"]) == 6
        assert s["net_profit"] == s["revenue"] - s["purchases"] - s["salaries"] - s["expenses"]

    def test_assistant_summary_hides_financials(self, assistant_token, doctor_token):
        requests.patch(f"{API}/settings", json={"show_financials_to_assistants": False},
                       headers=h(doctor_token), timeout=30)
        r = requests.get(f"{API}/reports/summary", headers=h(assistant_token), timeout=30)
        assert r.status_code == 200
        s = r.json()
        assert s["financials_visible"] is False
        assert "net_profit" not in s
        assert "revenue" not in s


# ------------- Assistant Management -------------

class TestAssistantMgmt:
    created = None

    def test_doctor_create_assistant(self, doctor_token):
        email = f"TEST_asst_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/assistants",
                          json={"email": email, "password": "test1234",
                                "full_name": "TEST Asst"},
                          headers=h(doctor_token), timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "assistant"
        TestAssistantMgmt.created = u["id"]

    def test_doctor_list_assistants(self, doctor_token):
        r = requests.get(f"{API}/auth/assistants", headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
        assert any(u["id"] == TestAssistantMgmt.created for u in r.json())

    def test_assistant_forbidden_from_list(self, assistant_token):
        r = requests.get(f"{API}/auth/assistants", headers=h(assistant_token), timeout=30)
        assert r.status_code == 403

    def test_assistant_forbidden_from_create(self, assistant_token):
        r = requests.post(f"{API}/auth/assistants",
                          json={"email": "x@x.com", "password": "test1234", "full_name": "x"},
                          headers=h(assistant_token), timeout=30)
        assert r.status_code == 403

    def test_doctor_delete_assistant(self, doctor_token):
        r = requests.delete(f"{API}/auth/assistants/{TestAssistantMgmt.created}",
                            headers=h(doctor_token), timeout=30)
        assert r.status_code == 200
