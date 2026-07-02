import {
  MD_SETTINGS_ENVELOPE_KEYS,
  parseSettingEnvelope,
} from '../../../packages/supabase/md-settings-envelope';

import {
  parsePortalBrandThemeOverrides,
  resolveCvsBrandTokens,
  type CvsBrandTokens,
} from './cvs-brand-tokens';
import {
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from '../app/executive/settings/lib/executive-md-settings-db';

/** Load resolved CVS / executive portal brand tokens for the signed-in tenant. */
export async function loadExecutiveBrandTokens(): Promise<CvsBrandTokens> {
  try {
    const companyId = await resolveExecutiveCompanyId();
    const db = getMdSettingsDb();
    const { data } = await db
      .from('md_settings')
      .select('setting_value')
      .eq('company_id', companyId)
      .maybeSingle();

    const envelope = parseSettingEnvelope(
      (data as { setting_value?: unknown } | null)?.setting_value,
    );
    const overrides = parsePortalBrandThemeOverrides(
      envelope[MD_SETTINGS_ENVELOPE_KEYS.portalBrandTheme],
    );
    return resolveCvsBrandTokens(overrides);
  } catch {
    return resolveCvsBrandTokens(null);
  }
}
