import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveCompanyIdForSession } from '../../../../lib/company-context-server';
import { clampGeofenceRadiusM } from '../../../../lib/site-geofence';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../../packages/supabase/server';

/**
 * Resolve md_settings company scope for executive routes.
 * Uses session ∩ slug membership (no slug-first override).
 */
export async function resolveExecutiveCompanyId(
  sessionClient?: SupabaseClient,
): Promise<string> {
  const supabase = sessionClient ?? (await createSupabaseServerClient());
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) {
    throw new Error('Tenant context required. Sign in on your company subdomain.');
  }
  return companyId;
}

/** Service-role client for md_settings — avoids RLS / missing-session write failures. */
export function getMdSettingsDb() {
  return createSupabaseServiceClient();
}

export async function getExecutiveMdSettingsContext() {
  const session = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId(session);
  const db = getMdSettingsDb();
  const {
    data: { user },
  } = await session.auth.getUser();
  return { session, db, companyId, user };
}

export async function assertExecutiveMdSettingsWrite(vaultPin?: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { assertExecutivePortalSecurityGate } = await import(
    '../../../../lib/executive-portal-server-gate'
  );
  const portalGate = await assertExecutivePortalSecurityGate();
  if (!portalGate.ok) return { ok: false, error: portalGate.error };

  const { assertVaultPinVerified } = await import('../../../../lib/executive-vault-session');
  const gate = await assertVaultPinVerified(vaultPin);
  if (!gate.ok) return { ok: false, error: gate.error };
  return { ok: true };
}

/** Safe default on first md_settings insert — satisfies 1–25 m and legacy ≥ 25 m DB checks. */
const MD_SETTINGS_GEOFENCE_INSERT_DEFAULT_M = 25;

/**
 * Partial md_settings upserts must not rely on a stale DB default (e.g. 150 m) when inserting
 * the first row — that violates md_settings_default_geofence_radius_m_check (1–25 m).
 */
export async function upsertMdSettings(
  db: SupabaseClient,
  companyId: string,
  patch: Record<string, unknown>,
) {
  const row: Record<string, unknown> = { company_id: companyId, ...patch };

  if ('default_geofence_radius_m' in patch) {
    row.default_geofence_radius_m = clampGeofenceRadiusM(Number(patch.default_geofence_radius_m));
  } else {
    const { data: existing, error: fetchError } = await db
      .from('md_settings')
      .select('default_geofence_radius_m')
      .eq('company_id', companyId)
      .maybeSingle();

    if (fetchError) {
      return { data: null, error: fetchError };
    }

    const stored = (existing as { default_geofence_radius_m?: number | null } | null)
      ?.default_geofence_radius_m;
    // Always send an explicit value — remote DB default may still be 150 m while check is 1–25 m.
    row.default_geofence_radius_m =
      stored != null
        ? clampGeofenceRadiusM(stored)
        : clampGeofenceRadiusM(MD_SETTINGS_GEOFENCE_INSERT_DEFAULT_M);
  }

  return db.from('md_settings').upsert(row, { onConflict: 'company_id' });
}
