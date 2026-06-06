import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFAULT_RANK_PAY_MATRIX } from '../rank-pay-matrix';

const DEFAULT_GEOFENCE_RADIUS_M = 150;

export type TenantExecutiveSeed = {
  mdEmail: string;
  odEmail: string;
};

/** Default md_settings row for a freshly provisioned tenant. */
export function buildDefaultMdSettingsRow(companyId: string) {
  return {
    company_id: companyId,
    vat_rate: 18,
    sscl_rate: 2.5641,
    wb_working_days: 26,
    wb_hours: 200,
    wb_ot_multiplier: 1.5,
    so_working_days: 20,
    so_hours: 180,
    so_ot_multiplier: 1.5,
    statutory_takehome_floor: 40,
    max_deduction_pct: 20,
    default_geofence_radius_m: DEFAULT_GEOFENCE_RADIUS_M,
    rank_pay_matrix: DEFAULT_RANK_PAY_MATRIX,
    penalty_catalog: [],
    replacement_catalog: [],
  };
}

async function probeEmployeeColumns(db: SupabaseClient) {
  const optional = new Set<string>();
  for (const col of ['group', 'email']) {
    const { error } = await db.from('employees').select(col).limit(1);
    if (!error) optional.add(col);
  }
  return optional;
}

export async function seedExecutiveEmployees(
  db: SupabaseClient,
  companyId: string,
  companyName: string,
  mdEmail: string,
  odEmail: string,
) {
  const optional = await probeEmployeeColumns(db);
  const today = new Date().toISOString().split('T')[0];

  const executives = [
    {
      emp_number: 'MD-001',
      full_name: `${companyName} — MANAGING DIRECTOR`,
      rank: 'MD',
      email: mdEmail,
      group: 'HEAD_OFFICE',
    },
    {
      emp_number: 'OD-001',
      full_name: `${companyName} — OPERATIONS DIRECTOR`,
      rank: 'OD',
      email: odEmail,
      group: 'HEAD_OFFICE',
    },
  ];

  for (const exec of executives) {
    const row: Record<string, unknown> = {
      company_id: companyId,
      emp_number: exec.emp_number,
      full_name: exec.full_name,
      rank: exec.rank,
      status: 'ACTIVE',
      date_joined: today,
      salary_type: 'BANK',
    };
    if (optional.has('group')) row.group = exec.group;
    if (optional.has('email')) row.email = exec.email;

    const { data: existing } = await db
      .from('employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('emp_number', exec.emp_number)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await db.from('employees').update(row).eq('id', existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from('employees').insert([row]);
      if (error) throw new Error(error.message);
    }
  }
}

export async function seedTenantMdSettings(db: SupabaseClient, companyId: string) {
  const payload = buildDefaultMdSettingsRow(companyId);

  let { error } = await db.from('md_settings').upsert(payload, { onConflict: 'company_id' });

  if (error) {
    const fallback = {
      company_id: companyId,
      vat_rate: payload.vat_rate,
      sscl_rate: payload.sscl_rate,
      setting_value: JSON.stringify({
        rankPayMatrix: payload.rank_pay_matrix,
        defaultGeofenceRadiusM: payload.default_geofence_radius_m,
      }),
    };
    ({ error } = await db.from('md_settings').upsert(fallback, { onConflict: 'company_id' }));
    if (error) throw new Error(error.message);
  }
}

/** Seed everything a new tenant needs beyond the companies row. */
export async function provisionTenantDefaults(
  db: SupabaseClient,
  companyId: string,
  companyName: string,
  executives: TenantExecutiveSeed,
) {
  await seedExecutiveEmployees(
    db,
    companyId,
    companyName,
    executives.mdEmail.trim().toLowerCase(),
    executives.odEmail.trim().toLowerCase(),
  );
  await seedTenantMdSettings(db, companyId);
}
