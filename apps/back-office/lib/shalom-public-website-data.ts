import 'server-only';

import {
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
} from '../../../packages/supabase/md-settings-envelope';
import { resolveShalomPublicMediaPublicUrl } from '../../../packages/supabase/shalom-public-media-storage';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

import { resolveShalomPublicCompanyId } from './shalom-public-data';
import {
  mergeShalomPublicWebsiteContent,
  type ShalomPublicWebsiteContent,
} from './shalom-public-website-types';

export type ShalomPublicWebsiteContentView = ShalomPublicWebsiteContent & {
  heroImagePublicUrl: string | null;
  logoImagePublicUrl: string | null;
};

function enrichWebsiteMedia(
  content: ShalomPublicWebsiteContent,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '',
): ShalomPublicWebsiteContentView {
  const heroImagePublicUrl = content.heroImageUrl
    ? resolveShalomPublicMediaPublicUrl(supabaseUrl, content.heroImageUrl) ?? content.heroImageUrl
    : null;
  const logoImagePublicUrl = content.logoImageUrl
    ? resolveShalomPublicMediaPublicUrl(supabaseUrl, content.logoImageUrl) ?? content.logoImageUrl
    : null;

  return {
    ...content,
    heroImagePublicUrl,
    logoImagePublicUrl,
  };
}

export async function fetchShalomPublicWebsiteContent(
  companyId?: string,
): Promise<ShalomPublicWebsiteContentView> {
  const scopedCompanyId = companyId ?? (await resolveShalomPublicCompanyId());
  const db = createSupabaseServiceClient();
  const envelope = await loadSettingEnvelope(db, scopedCompanyId);
  const raw = envelope[MD_SETTINGS_ENVELOPE_KEYS.shalomPublicWebsite];
  const merged = mergeShalomPublicWebsiteContent(
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null,
  );
  return enrichWebsiteMedia(merged);
}

export async function saveShalomPublicWebsiteContent(
  companyId: string,
  content: ShalomPublicWebsiteContent,
): Promise<{ success: boolean; error?: string }> {
  const db = createSupabaseServiceClient();
  const normalized = mergeShalomPublicWebsiteContent(content);
  const result = await mergeSettingEnvelope(db, companyId, {
    [MD_SETTINGS_ENVELOPE_KEYS.shalomPublicWebsite]: normalized,
  });

  if (!result.success) {
    return { success: false, error: result.error ?? 'Could not save website content.' };
  }

  return { success: true };
}
