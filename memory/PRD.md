# PRD — عيادتي (Eayadati) · Dental Clinic Management

## Problem Statement
تطبيق ويب/موبايل متكامل لإدارة عيادات الأسنان (Multi-tenant SaaS)، تصميم عصري هادئ (Sage/Slate)، عربي RTL.

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT auth (bcrypt), multi-tenant via JWT tenant_id.
  - **Storage: boto3 (S3-compatible) with local-filesystem fallback** (set S3_BUCKET to use S3; empty = local `/app/backend/uploads`). Server-side Pillow image compression.
  - **Email: standard smtplib SMTP** (set SMTP_HOST etc.; empty = reset email skipped, endpoint still returns ok).
  - No dependency on emergentintegrations — portable to Railway/any host. Routes under /api.
- Frontend: Expo Router (RTL, Tajawal font). Bottom tabs + stacks + public routes (book, p). MapView platform-split.

## Personas
1. المدير العام (super_admin) — owner, manages all doctor/assistant accounts.
2. الطبيب (doctor) — tenant owner, full access.
3. المساعد (assistant) — restricted from financials by default.
4. المريض (patient) — public booking + read-only portal (no login).

## Implemented (through 2026-08-18)
- Auth: JWT login/register, forgot/reset password (email), super admin dashboard, disabled-login block
- Patients CRUD + search, EHR, doctor_notes; PARTIAL patch (no data loss)
- Interactive FDI dental chart (quadrant layout, persists) + treatment palette (frequent + searchable "all types" + add custom type with auto distinct color); X-ray upload with auto compression (client + server Pillow)
- Treatment sessions: select teeth + type → «حفظ المعالجة» creates a treatment (auto initial session) & opens session modal; add follow-up sessions; chart resets after save; treatments log lists all with dates/session counts
- Per-patient billing management page (treatment/cost/paid/remaining/date, SYP/USD)
- Invoices (4 kinds) with search + date filter, currency SYP/USD, edit/delete
- Public auto-updating patient portal /p/{token} (financials + medical report + chart) — replaces stored PDFs
- Smart WhatsApp: sends patient portal link; appointment confirm + tomorrow reminders
- Public booking portal /book/{tenant} (slots, pending bookings)
  - Slots 08:00→22:30 (30-min, last appt 22:30 ends 23:00); 12-hour Arabic labels; dropdown/modal picker; booked slots disabled ("محجوز"); server-side slot validation (400 off-grid, 409 duplicate); refetch after booking
- Inventory (+low-stock), Lab orders, Dashboard (daily summary + charts)
- Super Admin subscriptions: doctors auto 'trial' (no expiry) → admin sets 'subscribed' (monthly/quarterly/semiannual/annual, due date auto-computed) → 'disabled' manual or auto on expiry (lazy check on login+admin list, blocks login, instant reactivation); admin panel has status badges, status filter, search, expiring-soon alerts, reg date, phone; doctor dashboard shows ≤14-day expiry banner (via /reports/summary)
- Financial reports page /more/reports: daily/weekly/monthly/yearly profit per currency + year dropdown (2026+); dashboard quick button
- Clinic location: GPS + interactive OpenStreetMap; share booking link
- Backend tests: iterations 1-6 all passing

## Backlog (P1/P2)
- AI assistant (treatment plans/consult) — deferred
- Automated reminders (push/WhatsApp Business API) — needs native build
- Multi-currency-aware profit reports (currently sums per currency)
- server.py module split (~1180 lines); RN-Web shadow*/pointerEvents migration
