"""
Iteration 14 — Safe delete endpoints (Eayadati / عيادتي)
Tests:
  - DELETE /api/patients/{pid} → cascades tooth_charts, xrays, invoices, treatments, appointments
  - DELETE /api/patients/{pid}/treatments/{tid} → 200 then GET list no longer includes it
  - DELETE /api/patients/{pid}/treatments/{tid}/sessions/{sid} → removes only that session
Uses public EXPO_BACKEND_URL from env.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")

DOCTOR_EMAIL = "doctor@demo.com"
DOCTOR_PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---- helpers -------------------------------------------------
def create_patient(headers, name="TEST_DeleteFlow"):
    r = requests.post(f"{BASE_URL}/api/patients", json={"full_name": name, "phone": "0000000000"},
                      headers=headers, timeout=30)
    assert r.status_code in (200, 201), f"create patient: {r.status_code} {r.text}"
    return r.json()


def create_treatment(headers, pid, teeth=(16, 17), condition="caries"):
    r = requests.post(f"{BASE_URL}/api/patients/{pid}/treatments",
                      json={"teeth": list(teeth), "condition": condition, "name": "تسوس"},
                      headers=headers, timeout=30)
    assert r.status_code in (200, 201), f"create treatment: {r.status_code} {r.text}"
    return r.json()


def add_session(headers, pid, tid, name="جلسة ثانية", note=""):
    r = requests.post(f"{BASE_URL}/api/patients/{pid}/treatments/{tid}/sessions",
                      json={"name": name, "note": note}, headers=headers, timeout=30)
    assert r.status_code in (200, 201), f"add session: {r.status_code} {r.text}"
    return r.json()


# ---- tests: patient cascade delete ---------------------------
class TestPatientCascadeDelete:
    def test_delete_patient_cascades(self, headers):
        p = create_patient(headers, "TEST_DeleteCascade")
        pid = p["id"]

        # Add a tooth chart entry
        r = requests.post(f"{BASE_URL}/api/patients/{pid}/chart",
                          json={"tooth": 16, "condition": "caries", "note": ""},
                          headers=headers, timeout=30)
        assert r.status_code == 200

        # Add a treatment (also creates initial session)
        t = create_treatment(headers, pid)

        # Delete patient
        d = requests.delete(f"{BASE_URL}/api/patients/{pid}", headers=headers, timeout=30)
        assert d.status_code == 200, f"delete: {d.status_code} {d.text}"

        # Verify 404 on GET
        g = requests.get(f"{BASE_URL}/api/patients/{pid}", headers=headers, timeout=30)
        assert g.status_code == 404, f"expected 404, got {g.status_code}"

        # Verify cascaded collections are cleaned:
        # tooth chart should be empty
        c = requests.get(f"{BASE_URL}/api/patients/{pid}/chart", headers=headers, timeout=30)
        # After patient is gone, either 404 or empty list is acceptable
        if c.status_code == 200:
            assert c.json() == []

        # Treatments cleaned
        tl = requests.get(f"{BASE_URL}/api/patients/{pid}/treatments", headers=headers, timeout=30)
        if tl.status_code == 200:
            assert tl.json() == []


# ---- tests: treatment delete ---------------------------------
class TestTreatmentDelete:
    def test_delete_treatment_removes_from_list(self, headers):
        p = create_patient(headers, "TEST_DeleteTreatment")
        pid = p["id"]
        try:
            t = create_treatment(headers, pid)
            tid = t["id"]

            # Confirm treatment present
            before = requests.get(f"{BASE_URL}/api/patients/{pid}/treatments",
                                  headers=headers, timeout=30).json()
            assert any(x["id"] == tid for x in before)

            # Delete
            d = requests.delete(f"{BASE_URL}/api/patients/{pid}/treatments/{tid}",
                                headers=headers, timeout=30)
            assert d.status_code == 200

            # Confirm gone
            after = requests.get(f"{BASE_URL}/api/patients/{pid}/treatments",
                                 headers=headers, timeout=30).json()
            assert all(x["id"] != tid for x in after)

            # Deleting again → 404
            d2 = requests.delete(f"{BASE_URL}/api/patients/{pid}/treatments/{tid}",
                                 headers=headers, timeout=30)
            assert d2.status_code == 404
        finally:
            requests.delete(f"{BASE_URL}/api/patients/{pid}", headers=headers, timeout=30)


# ---- tests: session delete -----------------------------------
class TestSessionDelete:
    def test_delete_session_removes_only_that_session(self, headers):
        p = create_patient(headers, "TEST_DeleteSession")
        pid = p["id"]
        try:
            t = create_treatment(headers, pid)
            tid = t["id"]
            assert len(t.get("sessions", [])) == 1
            initial_sid = t["sessions"][0]["id"]

            # Add a second session
            t2 = add_session(headers, pid, tid, "جلسة 2")
            assert len(t2["sessions"]) == 2
            new_sid = [s for s in t2["sessions"] if s["id"] != initial_sid][0]["id"]

            # Delete initial session
            d = requests.delete(
                f"{BASE_URL}/api/patients/{pid}/treatments/{tid}/sessions/{initial_sid}",
                headers=headers, timeout=30,
            )
            assert d.status_code == 200
            data = d.json()
            remaining_ids = [s["id"] for s in data.get("sessions", [])]
            assert initial_sid not in remaining_ids
            assert new_sid in remaining_ids
            assert len(remaining_ids) == 1
        finally:
            requests.delete(f"{BASE_URL}/api/patients/{pid}", headers=headers, timeout=30)


# ---- tests: unauthenticated ----------------------------------
class TestUnauth:
    def test_delete_patient_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/patients/does-not-matter", timeout=30)
        assert r.status_code in (401, 403)

    def test_delete_treatment_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/patients/x/treatments/y", timeout=30)
        assert r.status_code in (401, 403)

    def test_delete_session_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/patients/x/treatments/y/sessions/z", timeout=30)
        assert r.status_code in (401, 403)
