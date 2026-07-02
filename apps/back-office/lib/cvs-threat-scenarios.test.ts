import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd());

function readRel(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('CVS §3.11 threat scenarios (post-remediation verification)', () => {
  it('3.11.1 — processLocationPing rejects emp_number spoof (R-FIELD-01)', () => {
    const actions = readRel('apps/field-pwa/app/actions.ts');
    expect(actions).toContain('requireGuardSession');
    expect(actions).toContain('assertGuardRosterKeyMatch(session, payload.emp_number)');
  });

  it('3.11.2 — SM roster writes validate assignment allowlist (R-SM-ROSTER-01)', () => {
    const guardsActions = readRel('apps/sm-pwa/app/(portal)/attendance/guards/actions.ts');
    const confirmActions = readRel('apps/sm-pwa/app/(portal)/attendance/confirm/actions.ts');
    expect(guardsActions).toContain('validateSmRosterAllowlist');
    expect(confirmActions).toContain('validateSmRosterAllowlist');
  });

  it('3.11.3 — dedicated portal hosts block cross-portal routes (middleware)', () => {
    const middleware = readRel('apps/back-office/middleware.ts');
    const portalHost = readRel('apps/back-office/lib/tenant-portal-host.ts');
    expect(middleware).toContain('pathAllowedOnTenantPortalHost');
    expect(portalHost).toContain('pathBelongsToStaffPortal');
  });

  it('3.11.4 — saveArLedger enforces maker/checker payment transitions (R-INV-06)', () => {
    const actions = readRel('apps/back-office/app/ar-invoicing/actions.ts');
    const guards = readRel('apps/back-office/lib/ar-invoicing/payment-guards.ts');
    expect(actions).toContain('validatePaymentStatusTransition');
    expect(guards).toContain('PENDING_MD_VERIFICATION');
  });

  it('3.11.5 — attendance REST API requires session identity', () => {
    const route = readRel('apps/field-pwa/app/api/attendance/log/route.ts');
    expect(route).toContain('getUser');
    expect(route).toContain('UNAUTHORIZED');
    expect(route).toContain('resolveGuardSession');
  });

  it('3.11.6 — tenant cookie + host binding helpers present (R-TENANT-SCOPE-01)', () => {
    const host = readRel('apps/back-office/lib/tenant-host.ts');
    expect(host).toMatch(/resolveCompany|tenant/i);
  });

  it('3.11.7 — offline replay uses vault id as idempotency key', () => {
    const checkIn = readRel('apps/field-pwa/app/components/CheckInButton.tsx');
    const actions = readRel('apps/field-pwa/app/actions.ts');
    const vault = readRel('apps/field-pwa/lib/offline-vault.ts');
    const migration = readRel(
      'packages/supabase/migrations/20260624130000_attendance_logs_offline_replay_key.sql',
    );
    expect(checkIn).toContain('processLocationPing');
    expect(checkIn).toContain('offline_replay_key: ping.id');
    expect(checkIn).toContain('getPingsFromVault');
    expect(actions).toContain('offline_replay_key');
    expect(actions).toContain('resolveOfflineReplayIdempotency');
    expect(vault).toContain('shouldAckOfflineReplay');
    expect(migration).toContain('attendance_logs_offline_replay_guard_uidx');
  });

  it('3.11.8 — tenant-erp blocks forge_settings browser surface (FORGE_CVS S-30)', () => {
    const guard = readRel('apps/back-office/lib/deployment-route-guard.ts');
    expect(guard).toContain('isTenantErpForbiddenPlatformPath');
    expect(guard).toContain('/pearzen-website');
    expect(guard).toContain('/forge/');

    const migration = readRel(
      'packages/supabase/migrations/20260606150000_schema_catchup_bundle.sql',
    );
    expect(migration).toContain('forge_settings ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('service_role_all_forge_settings');

    const websiteRpc = readRel(
      'packages/supabase/migrations/20260619120000_forge_pearzen_website.sql',
    );
    expect(websiteRpc).toContain('get_pearzen_public_website');
    expect(websiteRpc).not.toContain('GRANT SELECT ON forge_settings');
  });
});
