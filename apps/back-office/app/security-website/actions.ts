'use server';

import { revalidatePath } from 'next/cache';

import {
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from '../executive/settings/lib/executive-md-settings-db';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import {
  MD_SETTINGS_ENVELOPE_KEYS,
  loadSettingEnvelope,
} from '../../../../packages/supabase/md-settings-envelope';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { isExecutiveRank } from '../../lib/portal-role-utils';
import {
  fetchSecurityWebsiteContent,
  fetchSecurityWebsiteQuoteRecipientEmails,
  resolveSecurityWebsiteCompanyId,
} from '../../lib/security-website-data';
import {
  fetchTenantPublicSiteRow,
  upsertTenantPublicSiteDraft,
} from '../../lib/tenant-public-site-data';
import {
  ranksForCorporateGroup,
} from '../../../../packages/rank-pay-matrix';
import {
  uploadSecurityWebsiteClientLogo,
  uploadSecurityWebsiteImage,
  uploadSecurityWebsiteTrainingGalleryImage,
  type SecurityWebsiteImageSlot,
} from '../../lib/security-website-images';
import { getRankPayMatrix } from '../executive/settings/rank-matrix-actions';
import { persistMdSettingEnvelopeWithAudit } from '../executive/settings/settings-audit';
import type { RankPayEntry } from '../../../../packages/rank-pay-matrix';
import {
  mergeSecurityWebsiteContent,
  type SecurityWebsiteContent,
} from '../../lib/security-website-types';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';

export type SecurityWebsiteLeadInput = {
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  clientCompany?: string;
  siteDistrict?: string;
  serviceType?: string;
  guardsNeeded?: number;
  shiftPattern?: string;
  preferredStart?: string;
  estimatedMonthlyLkr?: number;
  notes?: string;
  source?: string;
};

async function requireWebsiteEditor(): Promise<
  | { ok: true; user: { id: string }; profile: Awaited<ReturnType<typeof fetchBackOfficeUserProfile>> }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, error: 'Please sign in again to upload images.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    return { ok: false, error: 'You do not have permission to edit this website.' };
  }
  return { ok: true, user, profile };
}

async function syncPublishedSecurityWebsiteIfLive(
  companyId: string,
  content: SecurityWebsiteContent,
  publishedByEmail: string | null,
): Promise<void> {
  const publishedRow = await fetchTenantPublicSiteRow(companyId, 'security_marketing');
  if (!publishedRow?.publishedAt) return;

  await upsertTenantPublicSiteDraft({
    companyId,
    siteType: 'security_marketing',
    hostname: publishedRow.hostname,
    contentJson: content as unknown as Record<string, unknown>,
    publish: true,
    publishedByEmail,
  });
}

export async function getSecurityWebsitePageData(): Promise<{
  content: SecurityWebsiteContent;
  canEdit: boolean;
  guardRanks: RankPayEntry[];
  quoteRecipientEmails: string[];
}> {
  const companyId = await resolveSecurityWebsiteCompanyId();
  const [content, rankMatrix, quoteRecipientEmails] = await Promise.all([
    fetchSecurityWebsiteContent(companyId),
    getRankPayMatrix(),
    fetchSecurityWebsiteQuoteRecipientEmails(companyId),
  ]);
  const guardRanks = ranksForCorporateGroup(rankMatrix, 'GUARD');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { content, canEdit: false, guardRanks, quoteRecipientEmails };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  return {
    content,
    canEdit: isExecutiveRank(profile.role),
    guardRanks,
    quoteRecipientEmails,
  };
}

export async function saveSecurityWebsiteContent(
  content: SecurityWebsiteContent,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireWebsiteEditor();
  if (!auth.ok) return { success: false, error: auth.error };

  try {
    const supabase = await createSupabaseServerClient();
    const companyId = await resolveExecutiveCompanyId(supabase);
    const db = getMdSettingsDb();
    const normalized = mergeSecurityWebsiteContent(content);

    const result = await persistMdSettingEnvelopeWithAudit(
      db,
      companyId,
      { [MD_SETTINGS_ENVELOPE_KEYS.securityWebsite]: normalized },
      'UPDATE_SECURITY_WEBSITE_CONTENT',
      {
        fieldCount: Object.keys(normalized).length,
        hasHero: Boolean(normalized.heroImageUrl),
      },
    );

    if (!result.success) return result;

    await syncPublishedSecurityWebsiteIfLive(
      companyId,
      normalized,
      auth.user.email ?? null,
    );

    revalidatePath('/security-website', 'layout');
    revalidatePath('/dashboard');
    revalidatePath('/executive/audit');

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save website content.';
    console.error('saveSecurityWebsiteContent:', message);
    return { success: false, error: message };
  }
}

export async function submitSecurityWebsiteLead(
  input: SecurityWebsiteLeadInput,
): Promise<{ success: boolean; leadId?: string; error?: string }> {
  const companyId = await resolveSecurityWebsiteCompanyId();
  const content = await fetchSecurityWebsiteContent(companyId);
  const supabase = createSupabaseServiceClient();

  const { data: leadId, error } = await supabase.rpc('submit_security_website_lead', {
    p_company_id: companyId,
    p_contact_name: input.contactName.trim(),
    p_contact_phone: input.contactPhone.trim(),
    p_contact_email: input.contactEmail?.trim() ?? null,
    p_client_company: input.clientCompany?.trim() ?? null,
    p_site_district: input.siteDistrict?.trim() ?? null,
    p_service_type: input.serviceType ?? null,
    p_guards_needed: input.guardsNeeded ?? null,
    p_shift_pattern: input.shiftPattern ?? null,
    p_preferred_start: input.preferredStart || null,
    p_estimated_monthly_lkr: input.estimatedMonthlyLkr ?? null,
    p_notes: input.notes?.trim() ?? null,
    p_source: input.source ?? 'quote_form',
  });

  if (error) {
    console.error('submitSecurityWebsiteLead:', error.message);
    return { success: false, error: error.message };
  }

  const opsEmail = content.opsNotificationEmail || content.contactEmail;
  const quoteRecipients = await fetchSecurityWebsiteQuoteRecipientEmails(companyId);
  const notifyEmails = quoteRecipients.length > 0 ? quoteRecipients : [opsEmail];
  console.info(
    `[security-website-lead] ops notify → ${notifyEmails.join(', ')}`,
    JSON.stringify({
      leadId,
      contact: input.contactName,
      phone: input.contactPhone,
      service: input.serviceType,
      estimate: input.estimatedMonthlyLkr,
    }),
  );

  return { success: true, leadId: leadId as string };
}

export async function uploadSecurityWebsiteSlotImage(
  slot: SecurityWebsiteImageSlot,
  dataUrl: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const auth = await requireWebsiteEditor();
    if (!auth.ok) return { success: false, error: auth.error };

    const supabase = await createSupabaseServerClient();
    const companyId = await resolveExecutiveCompanyId(supabase);
    const upload = await uploadSecurityWebsiteImage(companyId, slot, dataUrl);
    if (!upload.success || !upload.url) return upload;

    const db = getMdSettingsDb();
    const envelope = await loadSettingEnvelope(db, companyId);
    const current = mergeSecurityWebsiteContent(
      envelope[MD_SETTINGS_ENVELOPE_KEYS.securityWebsite] ?? null,
    );
    const fieldMap: Record<SecurityWebsiteImageSlot, keyof SecurityWebsiteContent> = {
      logo: 'logoUrl',
      hero: 'heroImageUrl',
      about: 'aboutImageUrl',
      tech: 'techImageUrl',
      timelineCoverage: 'timelineCoverageImageUrl',
      timelineMonitoring: 'timelineMonitoringImageUrl',
    };
    const field = fieldMap[slot];
    // Keep ?v= on the stored URL so repeat visits bust browser / Next image cache.
    const persistedUrl = upload.url;
    const next = { ...current, [field]: persistedUrl };

    const result = await persistMdSettingEnvelopeWithAudit(
      db,
      companyId,
      { [MD_SETTINGS_ENVELOPE_KEYS.securityWebsite]: next },
      'UPDATE_SECURITY_WEBSITE_CONTENT',
      { slot, field },
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Could not save image to settings.' };
    }

    await syncPublishedSecurityWebsiteIfLive(companyId, next, auth.user.email ?? null);

    revalidatePath('/security-website');
    revalidatePath('/security-website', 'layout');
    revalidatePath('/executive/audit');
    return upload;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    if (message.includes('Body exceeded')) {
      return { success: false, error: 'Image is too large. Try a smaller photo.' };
    }
    console.error('uploadSecurityWebsiteSlotImage:', message);
    return { success: false, error: message };
  }
}

export async function uploadSecurityWebsiteClientLogoAction(
  clientId: string,
  dataUrl: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const auth = await requireWebsiteEditor();
  if (!auth.ok) return { success: false, error: auth.error };
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId(supabase);
  return uploadSecurityWebsiteClientLogo(companyId, clientId, dataUrl);
}

export async function uploadSecurityWebsiteTrainingGalleryImageAction(
  imageId: string,
  dataUrl: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const auth = await requireWebsiteEditor();
    if (!auth.ok) return { success: false, error: auth.error };
    const supabase = await createSupabaseServerClient();
    const companyId = await resolveExecutiveCompanyId(supabase);
    return uploadSecurityWebsiteTrainingGalleryImage(companyId, imageId, dataUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    if (message.includes('Body exceeded')) {
      return { success: false, error: 'Image is too large. Try a smaller photo.' };
    }
    console.error('uploadSecurityWebsiteTrainingGalleryImageAction:', message);
    return { success: false, error: message };
  }
}
