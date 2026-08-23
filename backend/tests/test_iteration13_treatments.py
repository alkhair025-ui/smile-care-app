"""Iteration 13 — Patient treatments & sessions API tests.

Endpoints covered:
- POST /api/patients/{pid}/treatments  (creates a treatment with an auto initial session)
- POST /api/patients/{pid}/treatments/{tid}/sessions  (adds a follow-up session)
- GET  /api/patients/{pid}/treatments  (lists treatments, newest first, with sessions)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://smile-care-96.preview.emergentagent.com").rstrip("/")
DOCTOR = {"email": "doctor@demo.com", "password": "demo1234"}


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=DOCTOR, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def patient_id(auth):
    r = auth.get(f"{BASE_URL}/api/patients", timeout=20)
    assert r.status_code == 200, r.text
    lst = r.json()
    if not lst:
        # create a patient for the test
        r2 = auth.post(f"{BASE_URL}/api/patients", json={
            "name": "TEST_تجربة معالجة", "phone": "0900000000"
        }, timeout=20)
        assert r2.status_code in (200, 201), r2.text
        return r2.json()["id"]
    return lst[0]["id"]


class TestTreatmentsFlow:
    """Create → List → Add Session → List verification."""

    def test_create_treatment_returns_id_teeth_and_initial_session(self, auth, patient_id):
        payload = {"teeth": [16, 17], "condition": "caries", "name": "تسوّس"}
        r = auth.post(f"{BASE_URL}/api/patients/{patient_id}/treatments", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("id"), "missing id"
        assert data.get("teeth") == [16, 17]
        assert data.get("condition") == "caries"
        assert isinstance(data.get("sessions"), list) and len(data["sessions"]) == 1
        first = data["sessions"][0]
        assert first.get("name")
        assert first.get("date")
        # no mongo _id leak
        assert "_id" not in data
        pytest.tid = data["id"]

    def test_add_followup_session(self, auth, patient_id):
        tid = pytest.tid
        r = auth.post(
            f"{BASE_URL}/api/patients/{patient_id}/treatments/{tid}/sessions",
            json={"name": "جلسة ثانية", "note": "متابعة"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == tid
        assert len(data["sessions"]) == 2
        assert data["sessions"][-1]["name"] == "جلسة ثانية"
        assert data["sessions"][-1]["note"] == "متابعة"

    def test_list_treatments_contains_created_newest_first(self, auth, patient_id):
        r = auth.get(f"{BASE_URL}/api/patients/{patient_id}/treatments", timeout=20)
        assert r.status_code == 200, r.text
        lst = r.json()
        assert isinstance(lst, list) and len(lst) >= 1
        # our just-created treatment should be the newest (top)
        top = lst[0]
        assert top["id"] == pytest.tid
        assert len(top["sessions"]) == 2

    def test_add_session_unknown_treatment_returns_404(self, auth, patient_id):
        r = auth.post(
            f"{BASE_URL}/api/patients/{patient_id}/treatments/does-not-exist/sessions",
            json={"name": "x"},
            timeout=20,
        )
        assert r.status_code == 404

    def test_unauthenticated_rejected(self, patient_id):
        r = requests.get(f"{BASE_URL}/api/patients/{patient_id}/treatments", timeout=20)
        assert r.status_code in (401, 403)
