# PRD — عيادتي (Eayadati) · Dental Clinic Management

## Problem Statement
تطبيق ويب/موبايل متكامل لإدارة عيادات الأسنان (Multi-tenant SaaS)، تصميم عصري هادئ (Sage/Slate)، عربي RTL. مزايا: تسجيل دخول آمن بصلاحيات مرنة، EHR، مخطط أسنان FDI، أرشيف أشعة، تصدير PDF، فوترة شاملة، مشاركة واتساب، مواعيد، مستودع بتنبيهات، مخابر، تقارير أرباح.

## Architecture
- **Backend**: FastAPI + MongoDB (motor), JWT auth (bcrypt), multi-tenant isolation via JWT `tenant_id`. Emergent Object Storage for X-rays. Routes under `/api`.
- **Frontend**: Expo Router (RTL Arabic, Tajawal via expo-font). Bottom tabs + stacks. Auth context with SecureStore/localStorage.
- **Design**: `/app/design_guidelines.json` — Sage green (#4A7065) / Slate palette.

## User Personas
1. **الطبيب (Doctor)** — tenant owner, full access, manages assistants + financial visibility.
2. **المساعد (Assistant)** — sub-user, restricted from financials by default.

## Core Requirements (static)
- Multi-tenant secure auth · flexible financial permissions
- EHR (history/allergies/meds) · FDI dental chart · X-ray archive · PDF export
- Invoicing (patients/purchases/expenses/salaries) · WhatsApp share
- Appointments calendar · Inventory + low-stock alerts · Lab orders
- Profit reports with charts · Clinic location on map

## Implemented (2026-08-14)
- ✅ JWT email/password auth, multi-tenant, doctor/assistant roles + assistant management
- ✅ Role-based financial gating (toggle in settings) — verified 403/200
- ✅ Patients CRUD + search, EHR fields
- ✅ Interactive FDI dental chart (32 teeth, color-coded conditions, bottom sheet)
- ✅ X-ray upload/gallery via Emergent Object Storage
- ✅ PDF export (ختامي) via expo-print, WhatsApp share (deep-link)
- ✅ Invoices (4 kinds) with WhatsApp sharing
- ✅ Appointments with status chips
- ✅ Inventory with low-stock warnings, Lab orders with status tracking
- ✅ Dashboard: stats + financial summary + 6-month bar chart (SVG)
- ✅ Settings: clinic info, map link, permission toggle
- ✅ Full RTL Arabic UI, Tajawal font
- ✅ Backend 37/37 tests pass

## Implemented — Iteration 2 (2026-08-14)
- ✅ Invoice edit (PATCH) + delete with kebab menu (delete doctor-only)
- ✅ Inventory edit + delete
- ✅ Invoice PDF → uploaded to Object Storage → public download link → shared via WhatsApp (per invoice)
- ✅ Public patient booking portal `/book/{tenant_id}` (no login): day + available-slot picker → creates pending appointment; double-book protection (409)
- ✅ "Booking new" pending badge on appointments; doctor confirms
- ✅ Unified single patient page (info + doctor_notes editable + dental chart + x-rays + invoices with PDF/WhatsApp)
- ✅ New `doctor_notes` field on patient
- ✅ Clinic location via GPS (expo-location) + interactive OpenStreetMap (Leaflet in WebView) + share booking link
- ✅ Backend 52/52 tests pass, multi-tenant, doctor/assistant roles + assistant management
- ✅ Role-based financial gating (toggle in settings) — verified 403/200
- ✅ Patients CRUD + search, EHR fields
- ✅ Interactive FDI dental chart (32 teeth, color-coded conditions, bottom sheet)
- ✅ X-ray upload/gallery via Emergent Object Storage
- ✅ PDF export (ختامي) via expo-print, WhatsApp share (deep-link)
- ✅ Invoices (4 kinds) with WhatsApp sharing
- ✅ Appointments with status chips
- ✅ Inventory with low-stock warnings, Lab orders with status tracking
- ✅ Dashboard: stats + financial summary + 6-month bar chart (SVG)
- ✅ Settings: clinic info, map link, permission toggle
- ✅ Full RTL Arabic UI, Tajawal font
- ✅ Backend 37/37 tests pass

## Backlog (prioritized)
- **P1**: AI assistant (medical consult + treatment plans) — deferred from MVP
- **P1**: Automated appointment reminders (requires push notifications / native build)
- **P1**: Patient self-booking portal
- **P2**: Interactive map picker for clinic location (currently opens Google Maps)
- **P2**: Email invoice sharing (Resend integration)
- **P2**: Edit/delete for invoices & inventory from UI
- **P2**: server.py module split (currently ~790 lines)

## Next Tasks
- AI assistant integration on user request
- Reminder system after deploy/native build
