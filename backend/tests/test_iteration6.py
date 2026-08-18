"""
Iteration 6 backend tests — X-ray upload + server-side image compression.

Covers:
  - POST /api/patients/{id}/xrays (multipart) — returns id, storage_path, size,
    original_size, content_type, filename
  - Server-side compression for LARGE JPEG (3000x2200) reduces stored size vs original_size
    and normalizes content_type to image/jpeg
  - Tiny image is NOT grown (only replaced if compressed is smaller). content_type may
    stay original when compression yields no benefit.
  - Empty file returns 400
  - Non-image file: falls back gracefully (still stored, no crash)
  - GET /api/patients/{id}/xrays lists uploaded xrays
  - GET /api/xrays/{id}/file?token=... serves bytes
  - DELETE /api/xrays/{id} works
  - Regressions: public portal, dental chart persistence, partial patient PATCH,
    invoice currency SYP/USD, RBAC gating on /api/invoices for assistant
"""
import base64
import io
import json
import os
import time
import uuid

import pytest
import requests
from PIL import Image

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
    or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
)
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
    return {"Authorization": f"Bearer {doctor_token}"}


@pytest.fixture(scope="module")
def a_hdr(assistant_token):
    return {"Authorization": f"Bearer {assistant_token}"}


@pytest.fixture
def new_patient(hdr):
    payload = {
        "full_name": f"TEST_Iter6_{uuid.uuid4().hex[:6]}",
        "phone": "0999999999",
        "gender": "male",
    }
    r = requests.post(
        f"{API}/patients", json=payload,
        headers={**hdr, "Content-Type": "application/json"}, timeout=15,
    )
    assert r.status_code == 200, r.text
    p = r.json()
    yield p
    try:
        requests.delete(f"{API}/patients/{p['id']}", headers=hdr, timeout=15)
    except Exception:
        pass


def _make_jpeg(w: int, h: int, quality: int = 95) -> bytes:
    """Build a photographic-looking JPEG so it doesn't trivially compress."""
    import random
    img = Image.new("RGB", (w, h))
    pixels = img.load()
    random.seed(42)
    # Random noise blocks — resists strong compression, keeps size realistic.
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            c = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
            for dy in range(4):
                for dx in range(4):
                    if x + dx < w and y + dy < h:
                        pixels[x + dx, y + dy] = c
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


# ------------------------ X-ray upload + compression ------------------------
class TestXrayUpload:
    def test_upload_large_jpeg_compresses(self, hdr, new_patient):
        big = _make_jpeg(3000, 2200, quality=95)
        assert len(big) > 300_000, f"expected large source, got {len(big)}"
        files = {"file": ("big.jpg", big, "image/jpeg")}
        r = requests.post(
            f"{API}/patients/{new_patient['id']}/xrays",
            headers=hdr, files=files, timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Required fields
        for k in ("id", "storage_path", "size", "original_size", "content_type", "filename"):
            assert k in data, f"missing key {k} in {data}"
        assert data["original_size"] == len(big)
        assert data["size"] < data["original_size"], (
            f"compression did not shrink: size={data['size']} orig={data['original_size']}"
        )
        assert data["content_type"] == "image/jpeg"
        # Very lax bound: at least 30% smaller for 3000x2200 -> 1600x~1173 JPEG q60
        assert data["size"] < 0.7 * data["original_size"], (
            f"expected significant shrink; got {data['size']} vs {data['original_size']}"
        )

    def test_upload_tiny_image_not_grown(self, hdr, new_patient):
        # 100x100 already-compressed JPEG q50 — server compression should NOT grow it.
        tiny = _make_jpeg(100, 100, quality=50)
        files = {"file": ("tiny.jpg", tiny, "image/jpeg")}
        r = requests.post(
            f"{API}/patients/{new_patient['id']}/xrays",
            headers=hdr, files=files, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Only replace when strictly smaller; so stored size must be <= original
        assert data["size"] <= data["original_size"], (
            f"tiny image was grown: {data['size']} > {data['original_size']}"
        )

    def test_upload_empty_file_400(self, hdr, new_patient):
        files = {"file": ("empty.jpg", b"", "image/jpeg")}
        r = requests.post(
            f"{API}/patients/{new_patient['id']}/xrays",
            headers=hdr, files=files, timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_upload_non_image_falls_back(self, hdr, new_patient):
        raw = b"not-an-image-just-bytes-" * 20  # 480 bytes
        files = {"file": ("note.txt", raw, "text/plain")}
        r = requests.post(
            f"{API}/patients/{new_patient['id']}/xrays",
            headers=hdr, files=files, timeout=15,
        )
        # Not an image -> compression path skipped, still stored (200)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["size"] == len(raw)
        assert data["original_size"] == len(raw)
        assert data["content_type"].startswith("text/") or data["content_type"] == "text/plain"

    def test_list_and_get_and_delete(self, hdr, doctor_token, new_patient):
        # upload one
        small = _make_jpeg(400, 300, quality=80)
        files = {"file": ("s.jpg", small, "image/jpeg")}
        up = requests.post(
            f"{API}/patients/{new_patient['id']}/xrays",
            headers=hdr, files=files, timeout=30,
        )
        assert up.status_code == 200, up.text
        xid = up.json()["id"]

        # list
        lst = requests.get(
            f"{API}/patients/{new_patient['id']}/xrays", headers=hdr, timeout=15
        )
        assert lst.status_code == 200
        ids = [x["id"] for x in lst.json()]
        assert xid in ids

        # get file bytes via ?token=
        f = requests.get(
            f"{API}/xrays/{xid}/file", params={"token": doctor_token}, timeout=30
        )
        assert f.status_code == 200
        assert len(f.content) > 0
        # get without token -> 401
        f2 = requests.get(f"{API}/xrays/{xid}/file", timeout=15)
        assert f2.status_code == 401

        # delete
        d = requests.delete(f"{API}/xrays/{xid}", headers=hdr, timeout=15)
        assert d.status_code == 200

        # after delete: list no longer contains it
        lst2 = requests.get(
            f"{API}/patients/{new_patient['id']}/xrays", headers=hdr, timeout=15
        )
        assert xid not in [x["id"] for x in lst2.json()]


# ------------------------ Regressions ------------------------
class TestRegressions:
    def test_public_portal_still_works(self, hdr, new_patient):
        r = requests.get(
            f"{API}/patients/{new_patient['id']}/portal", headers=hdr, timeout=15
        )
        assert r.status_code == 200
        token = r.json()["token"]
        pub = requests.get(f"{API}/public/patient/{token}", timeout=15)
        assert pub.status_code == 200, pub.text
        body = pub.json()
        for k in ("clinic", "patient", "chart", "invoices", "financials"):
            assert k in body

    def test_partial_patient_patch_preserves_untouched(self, hdr, new_patient):
        orig_name = new_patient["full_name"]
        r = requests.patch(
            f"{API}/patients/{new_patient['id']}",
            headers={**hdr, "Content-Type": "application/json"},
            json={"medical_history": "TEST_HISTORY"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        got = requests.get(
            f"{API}/patients/{new_patient['id']}", headers=hdr, timeout=15
        ).json()
        assert got["full_name"] == orig_name
        assert got["medical_history"] == "TEST_HISTORY"

    def test_dental_chart_persistence(self, hdr, new_patient):
        r = requests.post(
            f"{API}/patients/{new_patient['id']}/chart",
            headers={**hdr, "Content-Type": "application/json"},
            json={"tooth": 11, "condition": "caries", "note": "TEST"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        got = requests.get(
            f"{API}/patients/{new_patient['id']}/chart", headers=hdr, timeout=15
        ).json()
        row = [t for t in got if t.get("tooth") == 11]
        assert row and row[0]["condition"] == "caries"

    def test_invoice_currency_syp_and_usd(self, hdr, new_patient):
        created_ids = []
        for cur, total in (("SYP", 50000), ("USD", 100)):
            r = requests.post(
                f"{API}/invoices",
                headers={**hdr, "Content-Type": "application/json"},
                json={
                    "kind": "patient",
                    "patient_id": new_patient["id"],
                    "items": [{"description": "check", "amount": total}],
                    "total": total,
                    "paid": 0,
                    "currency": cur,
                    "date": "2026-01-15",
                },
                timeout=15,
            )
            assert r.status_code == 200, r.text
            assert r.json()["currency"] == cur
            created_ids.append(r.json()["id"])
        # cleanup
        for iid in created_ids:
            requests.delete(f"{API}/invoices/{iid}", headers=hdr, timeout=15)

    def test_rbac_financial_gating_assistant(self, a_hdr, hdr):
        # ensure setting is OFF
        s = requests.patch(
            f"{API}/settings",
            headers={**hdr, "Content-Type": "application/json"},
            json={"show_financials_to_assistants": False},
            timeout=15,
        )
        assert s.status_code == 200, s.text
        r = requests.get(f"{API}/invoices", headers=a_hdr, timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
