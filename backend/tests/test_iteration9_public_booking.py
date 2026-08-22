"""
Iteration 9: Public booking endpoints tests
- GET /api/public/clinic/{tenant_id}/slots?date=YYYY-MM-DD → 30 slots 08:00..22:30
- POST /api/public/clinic/{tenant_id}/book → valid slot books
- POST book duplicate → 409
- POST book out-of-range (23:00) → 400
- Booked slot flips available=false
"""
import os
import uuid
import random
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
BASE_URL = BASE_URL.rstrip("/") if BASE_URL else "https://smile-care-96.preview.emergentagent.com"
TENANT_ID = "bf595268-f99b-44c7-a3d0-fdc979bc0250"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def future_date():
    # Use a date well in the future to avoid clashing with any prior test data
    d = datetime.now() + timedelta(days=30 + random.randint(0, 60))
    return d.strftime("%Y-%m-%d")


# ------- Slots endpoint -------

class TestPublicSlots:
    def test_clinic_exists(self, api):
        r = api.get(f"{BASE_URL}/api/public/clinic/{TENANT_ID}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["tenant_id"] == TENANT_ID
        assert body.get("clinic_name")

    def test_slots_shape(self, api, future_date):
        r = api.get(f"{BASE_URL}/api/public/clinic/{TENANT_ID}/slots", params={"date": future_date})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["date"] == future_date
        slots = body["slots"]
        # 08:00 → 22:30 inclusive at 30-min step = 30 slots
        assert len(slots) == 30, f"expected 30 slots, got {len(slots)}: {[s['time'] for s in slots]}"

    def test_slots_boundaries(self, api, future_date):
        r = api.get(f"{BASE_URL}/api/public/clinic/{TENANT_ID}/slots", params={"date": future_date})
        slots = r.json()["slots"]
        times = [s["time"] for s in slots]
        assert times[0] == "08:00"
        assert times[-1] == "22:30"
        # 23:00 must NOT appear
        assert "23:00" not in times
        # step is 30-min and sorted
        assert times == sorted(times)

    def test_slots_all_available_on_empty_date(self, api, future_date):
        r = api.get(f"{BASE_URL}/api/public/clinic/{TENANT_ID}/slots", params={"date": future_date})
        assert all(s["available"] is True for s in r.json()["slots"])

    def test_slots_unknown_tenant(self, api, future_date):
        r = api.get(f"{BASE_URL}/api/public/clinic/{uuid.uuid4()}/slots", params={"date": future_date})
        assert r.status_code == 404


# ------- Booking endpoint -------

class TestPublicBook:
    booked_time = "14:30"

    def test_book_valid_slot(self, api, future_date):
        payload = {
            "full_name": "TEST_Iter9 مريض تجريبي",
            "phone": f"+96279{random.randint(1000000, 9999999)}",
            "date": future_date,
            "time": self.booked_time,
            "reason": "TEST_Iter9 حجز اختبار",
        }
        r = api.post(f"{BASE_URL}/api/public/clinic/{TENANT_ID}/book", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "message" in body

    def test_slot_now_unavailable(self, api, future_date):
        r = api.get(f"{BASE_URL}/api/public/clinic/{TENANT_ID}/slots", params={"date": future_date})
        slots = {s["time"]: s["available"] for s in r.json()["slots"]}
        assert slots[self.booked_time] is False, "booked slot should be unavailable"
        # other slots still available
        assert slots["08:00"] is True
        assert slots["22:30"] is True

    def test_book_duplicate_returns_409(self, api, future_date):
        payload = {
            "full_name": "TEST_Iter9 مريض ثاني",
            "phone": f"+96279{random.randint(1000000, 9999999)}",
            "date": future_date,
            "time": self.booked_time,
            "reason": "duplicate",
        }
        r = api.post(f"{BASE_URL}/api/public/clinic/{TENANT_ID}/book", json=payload)
        assert r.status_code == 409, r.text

    def test_book_out_of_hours_23_00(self, api, future_date):
        payload = {
            "full_name": "TEST_Iter9 خارج الدوام",
            "phone": f"+96279{random.randint(1000000, 9999999)}",
            "date": future_date,
            "time": "23:00",
            "reason": "out-of-hours",
        }
        r = api.post(f"{BASE_URL}/api/public/clinic/{TENANT_ID}/book", json=payload)
        assert r.status_code == 400, r.text

    def test_book_out_of_hours_07_30(self, api, future_date):
        payload = {
            "full_name": "TEST_Iter9 قبل الدوام",
            "phone": f"+96279{random.randint(1000000, 9999999)}",
            "date": future_date,
            "time": "07:30",
            "reason": "before hours",
        }
        r = api.post(f"{BASE_URL}/api/public/clinic/{TENANT_ID}/book", json=payload)
        assert r.status_code == 400, r.text

    def test_book_non_grid_time_08_15(self, api, future_date):
        payload = {
            "full_name": "TEST_Iter9 وقت غير مطابق",
            "phone": f"+96279{random.randint(1000000, 9999999)}",
            "date": future_date,
            "time": "08:15",
            "reason": "not on 30-min grid",
        }
        r = api.post(f"{BASE_URL}/api/public/clinic/{TENANT_ID}/book", json=payload)
        assert r.status_code == 400, r.text

    def test_book_unknown_tenant(self, api, future_date):
        payload = {
            "full_name": "TEST_Iter9",
            "phone": "+962700000000",
            "date": future_date,
            "time": "09:00",
        }
        r = api.post(f"{BASE_URL}/api/public/clinic/{uuid.uuid4()}/book", json=payload)
        assert r.status_code == 404, r.text
