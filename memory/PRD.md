# PRD — عيادتي (Eayadati) · Dental Clinic Management

## Problem Statement
تطبيق ويب/موبايل متكامل لإدارة عيادات الأسنان (Multi-tenant SaaS)، تصميم عصري هادئ (Sage/Slate)، عربي RTL.

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT auth (bcrypt), multi-tenant via JWT tenant_id. Emergent Object Storage for X-rays (server-side Pillow compression). Emergent Resend email. Routes under /api.
- Frontend: Expo Router (RTL, Tajawal font). Bottom tabs + stacks + public routes (book, p). MapView platform-split (WebView native / iframe web).

## Personas
1. المدير العام (super_admin) — owner, manages all doctor/assistant accounts.
2. الطبيب (doctor) — tenant owner, full access.
3. المساعد (assistant) — restricted from financials by default.
4. المريض (patient) — public booking + read-only portal (no login).

## Implemented (through 2026-08-18)
- Auth: JWT login/register, forgot/reset password (email), super admin dashboard, disabled-login block
- Patients CRUD + search, EHR, doctor_notes; PARTIAL patch (no data loss)
- Interactive FDI dental chart (persists), X-ray upload with auto compression (client + server Pillow)
- Per-patient billing management page (treatment/cost/paid/remaining/date, SYP/USD)
- Invoices (4 kinds) with search + date filter, currency SYP/USD, edit/delete
- Public auto-updating patient portal /p/{token} (financials + medical report + chart) — replaces stored PDFs
- Smart WhatsApp: sends patient portal link; appointment confirm + tomorrow reminders
- Public booking portal /book/{tenant} (slots, pending bookings)
- Inventory (+low-stock), Lab orders, Dashboard (daily summary + charts)
- Clinic location: GPS + interactive OpenStreetMap; share booking link
- Backend tests: iterations 1-6 all passing

## Backlog (P1/P2)
- AI assistant (treatment plans/consult) — deferred
- Automated reminders (push/WhatsApp Business API) — needs native build
- Multi-currency-aware profit reports (currently sums per currency)
- server.py module split (~1180 lines); RN-Web shadow*/pointerEvents migration
