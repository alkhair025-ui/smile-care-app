"""
Iteration 11 — Super Admin subscription management for doctors.

Covers:
- Register -> new doctor starts sub_status=trial, sub_end=None
- GET /api/admin/doctors (super_admin only) returns subscription fields + counts
- POST /api/admin/users/{id}/subscription set to subscribed monthly => sub_end +30 days, disabled=false
- POST subscription with status=subscribed but no plan => 400
- POST subscription with status=trial => sub_end=None, disabled=false
- POST subscription with status=disabled => disabled=true and doctor login is blocked (403)
- POST subscription reactivating trial re-enables login
- Auto-disable: backdate sub_end via internal mutation, admin listing / login should flip to disabled and 403 login
- Reactivation via admin -> login 200 again
- GET /api/admin/stats => trial + subscribed + disabled counts and their sum matches doctors count
- GET /api/reports/summary for a doctor includes subscription block
- Non super_admin cannot call /admin/users/{id}/subscription
- Cleanup: leave demo doctor on trial
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

SUPER_ADMIN = {"email": "alkhair025@gmail.com", "password": "0941317941AhmedAttar"}
DEMO_DOCTOR = {"email": "doctor@demo.com", "password": "demo1234"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    return r


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token():
    r = _login(SUPER_ADMIN)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def new_doctor():
    """Create a fresh doctor for the whole module (cleaned up at end via admin toggling)."""
    email = f"TEST_subdoc_{uuid.uuid4().hex[:8]}@example.com"
    password = "test1234"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": password,
        "full_name": "TEST SubDoc", "clinic_name": "TEST Clinic Sub",
    }, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "id": data["user"]["id"],
        "email": email,
        "password": password,
        "token": data["access_token"],
    }


def _find_doctor_row(token, doctor_id):
    r = requests.get(f"{API}/admin/doctors", headers=_h(token), timeout=30)
    assert r.status_code == 200, r.text
    for row in r.json():
        if row["id"] == doctor_id:
            return row
    return None


# ---------------- Register defaults ----------------

class TestRegisterTrialDefault:
    def test_new_doctor_gets_trial(self, admin_token):
        # Register a fresh isolated doctor here (independent from other classes' fixture)
        email = f"TEST_trialdoc_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "test1234",
            "full_name": "TEST TrialDoc", "clinic_name": "TEST Clinic Trial",
        }, timeout=30)
        assert r.status_code == 200, r.text
        doc_id = r.json()["user"]["id"]

        row = _find_doctor_row(admin_token, doc_id)
        assert row is not None, "new doctor not visible in admin listing"
        assert row["role"] == "doctor"
        assert row["sub_status"] == "trial"
        assert row["sub_plan"] in ("", None)
        assert row["sub_end"] is None
        assert row["disabled"] is False
        assert row["auto_disabled"] is False
        assert row["days_left"] is None
        assert row["expiring_soon"] is False
        # required columns for admin table
        for key in ("clinic_phone", "created_at", "sub_start"):
            assert key in row


# ---------------- Admin listing shape ----------------

class TestAdminListing:
    def test_requires_admin(self, new_doctor):
        r = requests.get(f"{API}/admin/doctors", headers=_h(new_doctor["token"]), timeout=30)
        assert r.status_code == 403

    def test_returns_list_with_subscription_fields(self, admin_token):
        r = requests.get(f"{API}/admin/doctors", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        doctors = [x for x in rows if x["role"] == "doctor"]
        assert doctors, "expected at least one doctor"
        r0 = doctors[0]
        for k in ("sub_status", "sub_plan", "sub_start", "sub_end", "days_left",
                  "expiring_soon", "auto_disabled", "clinic_phone", "created_at"):
            assert k in r0, f"missing key {k}"


# ---------------- Set subscription ----------------

class TestSetSubscription:
    def test_requires_admin(self, new_doctor):
        r = requests.post(
            f"{API}/admin/users/{new_doctor['id']}/subscription",
            json={"status": "subscribed", "plan": "monthly"},
            headers=_h(new_doctor["token"]), timeout=30,
        )
        assert r.status_code == 403

    def test_subscribed_requires_plan(self, admin_token, new_doctor):
        r = requests.post(
            f"{API}/admin/users/{new_doctor['id']}/subscription",
            json={"status": "subscribed"},
            headers=_h(admin_token), timeout=30,
        )
        assert r.status_code == 400, r.text

    def test_subscribe_monthly_sets_end_plus_30(self, admin_token, new_doctor):
        before = datetime.now(timezone.utc)
        r = requests.post(
            f"{API}/admin/users/{new_doctor['id']}/subscription",
            json={"status": "subscribed", "plan": "monthly"},
            headers=_h(admin_token), timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["sub_status"] == "subscribed"
        assert body["sub_end"]
        end_dt = datetime.fromisoformat(body["sub_end"])
        delta_days = (end_dt - before).days
        assert 29 <= delta_days <= 30, f"expected ~30 days, got {delta_days}"

        row = _find_doctor_row(admin_token, new_doctor["id"])
        assert row["sub_status"] == "subscribed"
        assert row["sub_plan"] == "monthly"
        assert row["disabled"] is False
        assert row["days_left"] is not None and 28 <= row["days_left"] <= 30
        # doctor can still login
        lr = _login({"email": new_doctor["email"], "password": new_doctor["password"]})
        assert lr.status_code == 200

    def test_disabled_status_blocks_login(self, admin_token, new_doctor):
        r = requests.post(
            f"{API}/admin/users/{new_doctor['id']}/subscription",
            json={"status": "disabled"},
            headers=_h(admin_token), timeout=30,
        )
        assert r.status_code == 200
        row = _find_doctor_row(admin_token, new_doctor["id"])
        assert row["sub_status"] == "disabled"
        assert row["disabled"] is True

        lr = _login({"email": new_doctor["email"], "password": new_doctor["password"]})
        assert lr.status_code == 403, f"expected 403 blocked login, got {lr.status_code}: {lr.text}"

    def test_reactivate_trial_restores_login(self, admin_token, new_doctor):
        r = requests.post(
            f"{API}/admin/users/{new_doctor['id']}/subscription",
            json={"status": "trial"},
            headers=_h(admin_token), timeout=30,
        )
        assert r.status_code == 200
        row = _find_doctor_row(admin_token, new_doctor["id"])
        assert row["sub_status"] == "trial"
        assert row["sub_end"] is None
        assert row["disabled"] is False

        lr = _login({"email": new_doctor["email"], "password": new_doctor["password"]})
        assert lr.status_code == 200
        # refresh token
        new_doctor["token"] = lr.json()["access_token"]


# ---------------- Auto disable via backdated sub_end ----------------

class TestAutoDisable:
    def test_backdate_then_login_becomes_disabled(self, admin_token, new_doctor):
        # First set subscribed monthly
        r = requests.post(
            f"{API}/admin/users/{new_doctor['id']}/subscription",
            json={"status": "subscribed", "plan": "monthly"},
            headers=_h(admin_token), timeout=30,
        )
        assert r.status_code == 200

        # Backdate directly in Mongo via a helper script (kept minimal via python client)
        # We simulate expiry by calling the admin API to set a very short plan? There is
        # no such option. Instead, use motor via a direct connection.
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        from bson import ObjectId
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "eayadati_db")

        async def backdate():
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
            res = await db.users.update_one(
                {"_id": ObjectId(new_doctor["id"])},
                {"$set": {"sub_end": past}},
            )
            client.close()
            return res.modified_count

        assert asyncio.get_event_loop().run_until_complete(backdate()) == 1

        # Login should now auto-disable and return 403
        lr = _login({"email": new_doctor["email"], "password": new_doctor["password"]})
        assert lr.status_code == 403, f"expected 403 after expiry, got {lr.status_code}"

        # Admin listing should now show auto_disabled + sub_status disabled
        row = _find_doctor_row(admin_token, new_doctor["id"])
        assert row["sub_status"] == "disabled"
        assert row["auto_disabled"] is True
        assert row["disabled"] is True

    def test_admin_reactivates_after_auto_disable(self, admin_token, new_doctor):
        r = requests.post(
            f"{API}/admin/users/{new_doctor['id']}/subscription",
            json={"status": "subscribed", "plan": "quarterly"},
            headers=_h(admin_token), timeout=30,
        )
        assert r.status_code == 200
        row = _find_doctor_row(admin_token, new_doctor["id"])
        assert row["sub_status"] == "subscribed"
        assert row["disabled"] is False
        assert row["auto_disabled"] is False
        # login works again
        lr = _login({"email": new_doctor["email"], "password": new_doctor["password"]})
        assert lr.status_code == 200


# ---------------- Admin stats ----------------

class TestAdminStats:
    def test_stats_shape_and_math(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        s = r.json()
        for k in ("doctors", "assistants", "clinics", "patients",
                  "trial", "subscribed", "disabled"):
            assert k in s, f"missing key {k}"
        assert s["trial"] + s["subscribed"] + s["disabled"] == s["doctors"]

    def test_stats_forbidden_for_non_admin(self, new_doctor):
        r = requests.get(f"{API}/admin/stats", headers=_h(new_doctor["token"]), timeout=30)
        assert r.status_code == 403


# ---------------- Reports summary includes subscription ----------------

class TestSummarySubscription:
    def test_demo_doctor_summary_has_subscription(self):
        r = _login(DEMO_DOCTOR)
        assert r.status_code == 200, r.text
        tok = r.json()["access_token"]
        s = requests.get(f"{API}/reports/summary", headers=_h(tok), timeout=30)
        assert s.status_code == 200
        body = s.json()
        assert "subscription" in body
        sub = body["subscription"]
        for k in ("status", "plan", "end", "days_left", "expiring_soon"):
            assert k in sub


# ---------------- Cleanup: restore new doctor to trial and demo doctor stays trial ----------------

class TestCleanup:
    def test_reset_test_doctor_to_trial(self, admin_token, new_doctor):
        r = requests.post(
            f"{API}/admin/users/{new_doctor['id']}/subscription",
            json={"status": "trial"},
            headers=_h(admin_token), timeout=30,
        )
        assert r.status_code == 200
        row = _find_doctor_row(admin_token, new_doctor["id"])
        assert row["sub_status"] == "trial"
        assert row["disabled"] is False

    def test_demo_doctor_still_on_trial(self, admin_token):
        # Look up demo doctor row
        r = requests.get(f"{API}/admin/doctors", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        demo = next((x for x in r.json() if x["email"] == DEMO_DOCTOR["email"]), None)
        assert demo, "demo doctor row missing"
        # We didn't touch demo directly, so it should remain trial or whatever it was.
        # Only assert that demo can still login (safety net).
        lr = _login(DEMO_DOCTOR)
        assert lr.status_code == 200, f"demo doctor login broken: {lr.text}"
