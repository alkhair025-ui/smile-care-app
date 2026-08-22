"""
Iteration 10: Custom Treatment Types (per-tenant, auto-generated distinct colors).
Endpoints under test:
  GET  /api/treatment-types           (doctor + assistant can read)
  POST /api/treatment-types {label}   (doctor only; creates unique color)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://smile-care-96.preview.emergentagent.com").rstrip("/")

BUILTIN_TOOTH_COLORS = {
    "#FFFFFF", "#A84A42", "#4A7065", "#B58548",
    "#6B7876", "#B0C4BC", "#8B5CF6", "#334F46",
}

def _hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def _dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5

@pytest.fixture(scope="module")
def doctor_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "doctor@demo.com", "password": "demo1234"}, timeout=15)
    assert r.status_code == 200, f"doctor login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def doctor_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}", "Content-Type": "application/json"}


class TestTreatmentTypes:
    """Core CRUD-ish flow for the custom Treatment Types feature."""

    def test_list_returns_array(self, doctor_headers):
        r = requests.get(f"{BASE_URL}/api/treatment-types", headers=doctor_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)

    def test_create_reject_empty_label(self, doctor_headers):
        r = requests.post(f"{BASE_URL}/api/treatment-types",
                          headers=doctor_headers, json={"label": "   "}, timeout=15)
        assert r.status_code == 400, r.text

    def test_create_reject_missing_label(self, doctor_headers):
        r = requests.post(f"{BASE_URL}/api/treatment-types",
                          headers=doctor_headers, json={}, timeout=15)
        # Pydantic validation → 422
        assert r.status_code in (400, 422), r.text

    def test_create_and_uniqueness_and_distinct_colors(self, doctor_headers):
        """Create 3 types → each returns a color distinct from builtins AND from each other."""
        suffix = uuid.uuid4().hex[:6]
        labels = [f"TEST_ت_{suffix}_A", f"TEST_ت_{suffix}_B", f"TEST_ت_{suffix}_C"]
        created = []
        for lb in labels:
            r = requests.post(f"{BASE_URL}/api/treatment-types",
                              headers=doctor_headers, json={"label": lb}, timeout=15)
            assert r.status_code == 200, f"POST {lb} → {r.status_code} {r.text}"
            body = r.json()
            assert body["label"] == lb
            assert body["color"].startswith("#") and len(body["color"]) == 7
            assert body["key"].startswith("ct_")
            created.append(body)

        # Verify colors are distinct from every built-in (min distance > 30 in RGB)
        for t in created:
            rgb = _hex_to_rgb(t["color"])
            for b in BUILTIN_TOOTH_COLORS:
                d = _dist(rgb, _hex_to_rgb(b))
                assert d > 30, f"custom color {t['color']} too close to builtin {b} (d={d})"

        # Verify colors are pairwise distinct
        colors = [t["color"] for t in created]
        assert len(set(colors)) == len(colors), f"duplicate colors created: {colors}"
        for i in range(len(created)):
            for j in range(i + 1, len(created)):
                d = _dist(_hex_to_rgb(colors[i]), _hex_to_rgb(colors[j]))
                assert d > 30, f"colors[{i}] {colors[i]} too close to colors[{j}] {colors[j]} (d={d})"

        # Duplicate label → 409
        r = requests.post(f"{BASE_URL}/api/treatment-types",
                          headers=doctor_headers, json={"label": labels[0]}, timeout=15)
        assert r.status_code == 409, r.text

        # GET must include all three newly created types (persistence check)
        r = requests.get(f"{BASE_URL}/api/treatment-types", headers=doctor_headers, timeout=15)
        assert r.status_code == 200
        all_labels = [t["label"] for t in r.json()]
        for lb in labels:
            assert lb in all_labels, f"created label {lb} not persisted"

    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/treatment-types", timeout=15)
        assert r.status_code == 401

    def test_assistant_disabled_cannot_login(self):
        """Assistant account is currently disabled per agent note — verify."""
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "assistant@demo.com", "password": "demo1234"}, timeout=15)
        # Either 401 (bad creds) or 403 (disabled) — should NOT be 200
        assert r.status_code in (401, 403), r.text
