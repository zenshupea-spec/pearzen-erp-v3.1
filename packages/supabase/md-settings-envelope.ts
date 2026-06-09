import type { SupabaseClient } from '@supabase/supabase-js';

/** Keys stored inside md_settings.setting_value when dedicated columns are absent. */
export const MD_SETTINGS_ENVELOPE_KEYS = {
  rankPayMatrix: '_rankPayMatrix',
  gratuitySettings: '_gratuitySettings',
  welfareFundSettings: '_welfareFundSettings',
  divisionNames: '_divisionNames',
  compliance: '_compliance',
  geofence: '_geofence',
  payrollStatutory: '_payrollStatutory',
  engineConstants: '_engineConstants',
  bankExport: '_bankExport',
  payFormulas: '_payFormulas',
  portalRbacMatrix: '_portalRbacMatrix',
} as const;

export function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes('Could not find') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

/** Unwrap setting_value whether stored as a jsonb object or legacy string-encoded JSON. */
export function parseSettingEnvelope(raw: unknown): Record<string, unknown> {
  let current: unknown = raw;

  for (let depth = 0; depth < 4; depth += 1) {
    if (current == null) return {};
    if (typeof current === 'object' && !Array.isArray(current)) {
      return { ...(current as Record<string, unknown>) };
    }
    if (typeof current !== 'string') return {};

    const trimmed = current.trim();
    if (!trimmed) return {};

    try {
      current = JSON.parse(trimmed) as unknown;
    } catch {
      return {};
    }
  }

  return {};
}

export async function loadSettingEnvelope(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('md_settings')
    .select('setting_value')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    console.error('loadSettingEnvelope:', error.message);
    return {};
  }

  return parseSettingEnvelope((data as { setting_value?: unknown } | null)?.setting_value);
}

/**
 * Merge keys into setting_value and upsert. Use when a dedicated jsonb/text column is not deployed yet.
 */
export async function mergeSettingEnvelope(
  supabase: SupabaseClient,
  companyId: string,
  patch: Record<string, unknown>,
  scalar?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const envelope = await loadSettingEnvelope(supabase, companyId);
  const merged = { ...envelope, ...patch };

  const row: Record<string, unknown> = {
    company_id: companyId,
    // Store as jsonb object — legacy rows may still be string-encoded; parseSettingEnvelope handles both.
    setting_value: merged,
    ...scalar,
  };

  const { error } = await supabase.from('md_settings').upsert(row, { onConflict: 'company_id' });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
