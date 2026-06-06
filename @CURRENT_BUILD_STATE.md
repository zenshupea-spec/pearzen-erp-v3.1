Pearzen ERP v3.1 — What exists & where
Monorepo: apps/back-office (port 3002), apps/field-pwa (3001), apps/client-pwa (3000). Root npm run dev runs dev:kill then Turbo. Shared Supabase helpers: packages/supabase/ (server.ts, client.ts, route.ts, types.ts = partial manual types only, not imported by apps).
Back-office (apps/back-office/app/…)
OM live queue: om/page.tsx + VerificationQueue.tsx + om/actions.ts → attendance_logs (approve/reject).
OM roster UI: om/roster/page.tsx + RosterGrid.tsx → employees, locations, time_rosters via actions/time-engine.ts (note: migration uses site_id; some code still uses location_id — drift).
OM integrity (new): om/discrepancies/page.tsx → mock UI; actions/integrity.ts → shifts + executive_audit_logs.
HR: hr/page.tsx (companies/employees), hr/advances/ (real salary_advances), hr/layout.tsx.
Café shell: hr/cafe-roster/page.tsx — placeholder only (no DB).
Deductions: deductions/page.tsx + actions/deductions.ts → payroll_deductions insert; guard dropdown is mock.
Central hub: dashboard/page.tsx → reads users (role, hr_finance_override), links /hr, /om, /fm, /executive.
Payroll guard: payroll/layout.tsx (RBAC) — no payroll/page.tsx yet.
FM: fm/page.tsx — mock roster + local compensation engine; fm/export/, fm/advances/page.tsx hit DB where wired.
Executive / Forge: executive/settings, executive/audit, executive/matrix, forge/* → companies, md_settings, ranks, employees, audit logs as documented in repo.
Café roster actions (orphan): actions/cafe-roster-actions.ts → guard_sector_assignments, rostered_shifts, cafe_master_layouts — no page imports components/roster/CafeWeeklyRoster.tsx.
Other integrity (orphan): actions/integrity-actions.ts + components/integrity/DiscrepancyDashboard.tsx → attendance_logs path — not on a route we added.
Broken (fix before relying): hr/roster/actions.ts (supabe typo), fm/advances/actions.ts (truncated return).
Field PWA (apps/field-pwa/app/…)
Home / check-in: page.tsx + app/components/CheckInButton.tsx + actions.ts → employees, time_rosters, attendance_logs, storage attendance_selfies, incidents.
lib/earnings-engine.ts → browser Supabase attendance_logs.
Roster page: roster/page.tsx + actions/roster.ts → sector_manager_forms, om_action_queue (mock UI).
actions/roster-actions.ts + components/roster/SectorRosterForm.tsx — time_rosters with site_id — not wired to a route.
Client PWA (apps/client-pwa)
app/dashboard/page.tsx — mock metrics only, no Supabase.
DB / types
Migration in repo: packages/supabase/migrations/20260514000000_phase8_time_engine.sql → time_rosters, time_shifts (site_id).
packages/supabase/types.ts — only md_settings (extended), site_profiles, guard_sector_assignments, payroll_deductions; rest of DB untyped in code.
Handoff doc (full detail)
CURRENT_BUILD_STATE.md at repo root — file map, schema vs code drift, orphans, broken files, next actions.
One line for Gemini: “We have live OM verification + roster (with time_roster column drift), field check-in/attendance/incidents, HR advances, executive/forge flows, new /deductions + /om/discrepancies + café shell; orphan cafe/integrity components; partial types.ts; two broken action files; client-pwa mock only.”
That’s enough for Gemini to propose your next planned move (e.g. schema alignment, wire orphans, add /payroll page, fix broken actions, or unify integrity paths).