# Shalom Front Office — caretaker portal runbook

**Scope:** HR provision → MD property assignment → caretaker login and daily calendar use.

**Auth model:** EPF + 6-digit OTP (first login) or 6-digit PIN thereafter. No face capture at login. Supabase Auth namespace `{epf}@shalom.pearzen.local` (not configurable).

---

## Prerequisites

1. **Migrations applied** on the tenant Supabase project:

   ```bash
   npm run db:apply-portal-auth-shalom
   ```

   Includes stay-ops columns and the `shalom-guest-ids` bucket (`20260630120000_shalom_stay_ops.sql`).

   Requires `DATABASE_URL` or `SUPABASE_ACCESS_TOKEN` + linked project (see script header).

2. **Back-office env** (production on Vercel only — never in tracked `.env.production`):

   | Variable | Required | Notes |
   |----------|----------|-------|
   | `SUPABASE_SERVICE_ROLE_KEY` | Yes | Provision auth users + `shalom_portal_auth` writes |
   | `SHALOM_PORTAL_OTP_PEPPER` | Prod | OTP hash pepper; dev falls back to service role key |
   | `NEXT_PUBLIC_BACK_OFFICE_URL` | Yes (iCal) | Public HTTPS URL for Shalom OTA export links |
   | `RESEND_API_KEY` | Invoice email | Sends stay invoices via Resend |
   | `SHALOM_STAY_INVOICE_EMAIL_FROM` | Invoice email | Optional; defaults to `Shalom Caretaker <caretaker@shalom.com>` |

3. **Employee record:** `employees.group = 'SHALOM'`, valid `epf_no` / `epf_num`, active status.

---

## 1 — HR: provision caretaker access

**Route:** `/hr/shalom-portal` (HR Operations Desk → Shalom Front Office pill)

1. Confirm the caretaker appears in the active Shalom staff list (from MNR / group `SHALOM`).
2. Click **Provision** (or **Reset PIN**) for the employee.
3. HR receives a **6-digit OTP** in the UI flash (valid **60 seconds**). Communicate it to the caretaker out-of-band (phone / in person — not emailed).
4. Provision creates or updates:
   - Supabase Auth user `{epf}@shalom.pearzen.local`
   - `shalom_portal_auth` row with `needs_pin_setup = true`, `is_active = true`
5. **Deactivate** revokes portal access (`is_active = false`) without deleting the employee.

Audit: HR provision/deactivate events are logged (see `hr_portal_password_reset_audit`).

---

## 2 — MD: assign caretaker to property

**Route:** `/executive/shalom` → select property → **Caretaker EPF** dropdown

1. MD picks a provisioned Shalom caretaker EPF for the property.
2. `assignShalomCaretakerAction` sets `shalom_properties.caretaker_epf` and syncs `shalom_caretaker_property_assignments`.
3. A caretaker may be assigned to **multiple properties**; the front portal calendar merges all assigned properties.

Without assignment, the caretaker can log in but sees no property calendar data.

---

## 3 — Caretaker: first login and PIN setup

**Login:** `/login/shalom-front` (tenant subdomain, e.g. `cvshq.pearzen.tech/login/shalom-front`)

1. Enter **EPF number** (up to 10 chars) and the **6-digit OTP** from HR.
2. On success → redirect to `/shalom-front/set-pin` to choose a **6-digit PIN**.
3. After PIN setup → `/shalom-front` (multi-property calendar, collect amounts, daily login dots).

**Return visits:** EPF + 6-digit PIN (no OTP unless HR resets access).

**No login selfie (by design):** Shalom caretaker login is **EPF + OTP/PIN only** — there is no face capture step. Café counter staff (`/login/cafe-front`) require a live face at login plus GPS selfie at site check-in; that policy does not apply to Shalom FO. If HR later requires caretaker selfies, that would be a separate product change.

**Wrong portal:** Shalom staff authenticated on HQ/guard routes are redirected to `/login/shalom-front?error=wrong_portal`.

---

## 4 — Daily operations

| Surface | Route | Purpose |
|---------|-------|---------|
| Caretaker calendar | `/shalom-front` | Assigned properties, booking blocks, collect amounts |
| MD portfolio | `/executive/shalom` | All properties, caretaker assignment, login red/green dots |
| Master Hub tile | HQ → Shalom Front Office | Opens caretaker login URL for the tenant |

`shalom_portal_daily_logins` records one row per caretaker per company per calendar day (green = logged in).

---

## 5 — Stay operations (collect, damage, guest ID, invoice)

**Migration:** `packages/supabase/migrations/20260630120000_shalom_stay_ops.sql` adds booking columns (`damage_items`, `guest_id_document_url`, `invoice_*`) and the private `shalom-guest-ids` storage bucket.

### MD configuration (`/executive/shalom`)

Beside the unified calendar:

| Control | Storage | Purpose |
|---------|---------|---------|
| **Collect inquiry phone** | `shalom_properties.settings.collectInquiryPhone` | Number caretakers dial when collect amount is not set (default `+94753632001`) |
| **Damage types** | `shalom_properties.settings.damagePresets` | Preset list (label + LKR amount) caretakers pick when recording damage |

**Go-live gate:** Configure and **save** at least one damage type per property **before** caretakers use `/shalom-front` step ②. Empty presets → caretaker sees *“No damage types configured yet”* and cannot record damages. Use **Load starter templates** on the MD desk only as a draft — templates are not live until **Save damage types**.

On **day click** → booking modal → **Caretaker stay ops** card shows collect, damages, guest ID thumbnail, and invoice status (read-only except collect amount).

**Set collect amount:** same modal → LKR input → **Save collect amount** (or monthly register column). Writes `shalom_bookings.caretaker_collect_lkr`.

### Caretaker flow (`/shalom-front`)

Tap a coloured calendar day → **Stay details** drawer:

| Step | Action | DB / side effect |
|------|--------|------------------|
| ① Collect payment | Green box with LKR amount, or **Call MD** (`tel:` link) | Reads `caretaker_collect_lkr` |
| ② Record damage | Pick MD preset → **Add damage** | Appends to `damage_items` jsonb |
| ③ Guest ID photo | Camera upload; client compresses to ≤ 2 MB JPEG | `shalom-guest-ids` bucket → `guest_id_document_url` |
| ④ Invoice | Optional guest email → **Generate & send invoice** | `invoice_reference`, `invoice_email`, `invoice_sent_at` via Resend |

Drawer footer: **Need help? Call MD: {phone}** (property inquiry phone).

### Invoice email

- Generated reference format: `SHL-YYYY-NNNNN` (stable per booking).
- Sender: `caretaker@shalom.com` (see `SHALOM_STAY_INVOICE_EMAIL_FROM`).
- Without `RESEND_API_KEY`: invoice HTML/reference still generates; email is skipped.

### Unit tests

```bash
cd apps/back-office && npx vitest run \
  lib/shalom-stay-ops.test.ts \
  lib/shalom-stay-invoice.test.ts \
  lib/shalom-calendar.test.ts
```

Related: `packages/supabase/shalom-guest-id-storage.test.ts` (storage ref parsing).

### Manual verification checklist

| Check | Pass |
|-------|------|
| MD saved ≥1 damage preset per property before caretaker go-live | ☐ |
| Caretaker damage drawer lists MD presets (not empty state) | ☐ |
| No collect → Call MD dials configured number | ☐ |
| MD changes phone → caretaker sees new number | ☐ |
| Damage preset → caretaker records → MD sees in day modal | ☐ |
| ID upload ≤ 2 MB → MD preview in day modal | ☐ |
| Invoice email sends when `RESEND_API_KEY` set | ☐ |

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| OTP rejected immediately | OTP expires in 60s — HR must re-provision |
| “No properties” after login | MD has not assigned caretaker EPF on property |
| Login works on wrong portal | Middleware isolation — use `/login/shalom-front` only |
| iCal links broken for OTAs | Set `NEXT_PUBLIC_BACK_OFFICE_URL` to production HTTPS |
| Schema errors on provision | Run `npm run db:apply-portal-auth-shalom` on remote |
| Stay-ops / guest ID errors | Apply `20260630120000_shalom_stay_ops.sql` on remote |
| Invoice not emailed | Set `RESEND_API_KEY`; verify `pearzen.tech` domain in Resend |
| Guest ID preview blank | Service role upload OK; check signed URL action + bucket `shalom-guest-ids` |

**Manual E2E checklist:** `PORTAL_AUTH_AND_SHALOM_IMPLEMENTATION_STEPS.md` → Step 25.

**Portal auth matrix (all roles):** same plan → Step 26.
