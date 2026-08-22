"""
Iteration 12 — Dashboard multi-currency summary.
Verifies GET /api/reports/summary:
 * exposes list of currencies actually present in the account's invoices (SYP first, USD next).
 * returns aggregations filtered by ?currency=<code> only, without mixing currencies.
 * net_profit is consistent (= revenue - purchases - salaries - expenses) per currency.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
DOCTOR_EMAIL = "doctor@demo.com"
DOCTOR_PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def doctor_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD})
    assert r.status_code == 200, f"Doctor login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login response: {r.json()}"
    return token


@pytest.fixture(scope="module")
def auth_headers(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}", "Content-Type": "application/json"}


# ---------- Health / basic ----------

class TestSummaryCurrencies:
    def test_summary_default_returns_currencies_field(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/reports/summary", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("financials_visible") is True, "Doctor should see financials"
        assert "currencies" in data and isinstance(data["currencies"], list), \
            "summary must expose 'currencies' array"
        assert len(data["currencies"]) >= 1
        # SYP should come first when present
        if "SYP" in data["currencies"]:
            assert data["currencies"][0] == "SYP", \
                f"Expected SYP first, got {data['currencies']}"
        # USD next if present
        if "USD" in data["currencies"] and "SYP" in data["currencies"]:
            assert data["currencies"].index("USD") == 1
        # default currency == first available
        assert data.get("currency") == data["currencies"][0]

    def test_summary_has_both_syp_and_usd(self, api, auth_headers):
        """Demo doctor is seeded with SYP + USD invoices per problem statement."""
        r = api.get(f"{BASE_URL}/api/reports/summary", headers=auth_headers)
        data = r.json()
        assert "SYP" in data["currencies"], f"SYP missing: {data['currencies']}"
        assert "USD" in data["currencies"], f"USD missing: {data['currencies']}"

    def test_summary_default_returns_all_aggregate_fields(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/reports/summary", headers=auth_headers)
        data = r.json()
        for k in ("revenue", "purchases", "salaries", "expenses",
                  "net_profit", "today_income", "monthly"):
            assert k in data, f"Missing key {k} in summary"
        assert isinstance(data["monthly"], list) and len(data["monthly"]) == 6


class TestSummaryPerCurrencyFiltering:
    def test_summary_usd(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/reports/summary?currency=USD", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["currency"] == "USD"
        # net_profit consistency
        assert d["net_profit"] == d["revenue"] - d["purchases"] - d["salaries"] - d["expenses"], \
            f"USD net_profit mismatch: {d}"
        # monthly must not mix — sums of revenue/expenses per month ≤ overall aggregates
        month_rev = sum(m.get("revenue", 0) for m in d["monthly"])
        assert month_rev <= d["revenue"], \
            f"Monthly USD revenue sum ({month_rev}) exceeds total revenue ({d['revenue']})"

    def test_summary_syp(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/reports/summary?currency=SYP", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["currency"] == "SYP"
        assert d["net_profit"] == d["revenue"] - d["purchases"] - d["salaries"] - d["expenses"]

    def test_usd_and_syp_are_not_mixed(self, api, auth_headers):
        """Aggregates for USD and SYP MUST differ (no combined totals)."""
        rusd = api.get(f"{BASE_URL}/api/reports/summary?currency=USD",
                       headers=auth_headers).json()
        rsyp = api.get(f"{BASE_URL}/api/reports/summary?currency=SYP",
                       headers=auth_headers).json()
        # Different currency selection
        assert rusd["currency"] == "USD"
        assert rsyp["currency"] == "SYP"
        # At least one aggregate should differ; if all identical, that would be suspicious mixing
        differs = any(rusd[k] != rsyp[k] for k in
                      ("revenue", "purchases", "salaries", "expenses", "net_profit"))
        assert differs, \
            f"USD and SYP aggregates are identical — currencies are being mixed! USD={rusd} SYP={rsyp}"

    def test_invalid_currency_falls_back_to_first_available(self, api, auth_headers):
        r = api.get(f"{BASE_URL}/api/reports/summary?currency=XYZ", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["currency"] == d["currencies"][0], \
            "Invalid currency should fall back to first available currency"


class TestSummaryToday:
    def test_today_income_matches_selected_currency(self, api, auth_headers):
        """today_income must be non-negative and consistent with revenue for the same currency."""
        r = api.get(f"{BASE_URL}/api/reports/summary?currency=USD", headers=auth_headers)
        d = r.json()
        assert d["today_income"] >= 0
        assert d["today_income"] <= d["revenue"], \
            f"USD today_income ({d['today_income']}) exceeds total revenue ({d['revenue']})"

        r2 = api.get(f"{BASE_URL}/api/reports/summary?currency=SYP", headers=auth_headers)
        d2 = r2.json()
        assert d2["today_income"] >= 0
        assert d2["today_income"] <= d2["revenue"]
