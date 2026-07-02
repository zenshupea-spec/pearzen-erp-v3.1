import 'server-only';

import {
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
} from '../../../packages/supabase/md-settings-envelope';
import { getCompanyLogoUrl } from '../../../packages/supabase/company-branding';
import {
  resolveSecurityWebsiteClientLogo,
  resolveSecurityWebsiteSlotImage,
} from './security-website-brand';
import {
  mergeSecurityWebsiteContent,
  type SecurityWebsiteContent,
} from './security-website-types';
import { resolveTenantCompanyFromRequest } from './tenant-context-server';
import { fetchPublishedTenantPublicSiteJson } from './tenant-public-site-data';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { needsImageCacheBuster, withImageCacheBuster } from './security-website-images';

const VERSIONED_IMAGE_FIELDS: Array<keyof SecurityWebsiteContent> = [
  'heroImageUrl',
  'aboutImageUrl',
  'techImageUrl',
  'timelineCoverageImageUrl',
  'timelineMonitoringImageUrl',
];

async function ensureVersionedStorageImageUrls(
  companyId: string,
  content: SecurityWebsiteContent,
): Promise<SecurityWebsiteContent> {
  let next = content;
  let changed = false;

  for (const field of VERSIONED_IMAGE_FIELDS) {
    const url = content[field];
    if (typeof url !== 'string' || !needsImageCacheBuster(url)) continue;
    next = { ...next, [field]: withImageCacheBuster(url) };
    changed = true;
  }

  if (!changed) return content;

  const supabase = createSupabaseServiceClient();
  const result = await mergeSettingEnvelope(supabase, companyId, {
    [MD_SETTINGS_ENVELOPE_KEYS.securityWebsite]: next,
  });

  if (!result.success) {
    console.error('ensureVersionedStorageImageUrls:', result.error);
    return content;
  }

  return next;
}

export async function resolveSecurityWebsiteCompanyId(): Promise<string> {
  const tenant = await resolveTenantCompanyFromRequest();
  if (!tenant?.id) {
    throw new Error('Tenant context required for security website content.');
  }
  return tenant.id;
}

const QUOTE_RECIPIENT_RANKS = ['MD', 'OD', 'FM'] as const;

/** Active Head Office MD / OD / FM work emails for public quote mailto targets. */
export async function fetchSecurityWebsiteQuoteRecipientEmails(
  companyId: string,
): Promise<string[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('employees')
    .select('email, rank, status')
    .eq('company_id', companyId)
    .in('rank', [...QUOTE_RECIPIENT_RANKS])
    .not('email', 'is', null);

  if (error) {
    console.error('fetchSecurityWebsiteQuoteRecipientEmails:', error.message);
    return [];
  }

  const rankOrder = new Map<string, number>(
    QUOTE_RECIPIENT_RANKS.map((rank, index) => [rank, index]),
  );
  const seen = new Set<string>();
  const emails: string[] = [];

  for (const row of [...(data ?? [])].sort((a, b) => {
    const aRank = String(a.rank ?? '').trim().toUpperCase();
    const bRank = String(b.rank ?? '').trim().toUpperCase();
    return (rankOrder.get(aRank) ?? 99) - (rankOrder.get(bRank) ?? 99);
  })) {
    const status = String(row.status ?? '').trim().toUpperCase();
    if (status === 'RESIGNED' || status === 'TERMINATED') continue;

    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }

  return emails;
}

function withBrochureDefaults(content: SecurityWebsiteContent): SecurityWebsiteContent {
  return {
    ...content,
    heroImageUrl: resolveSecurityWebsiteSlotImage(content.heroImageUrl, 'hero'),
    aboutImageUrl: resolveSecurityWebsiteSlotImage(content.aboutImageUrl, 'about'),
    timelineCoverageImageUrl: resolveSecurityWebsiteSlotImage(
      content.timelineCoverageImageUrl,
      'coverage',
    ),
    timelineMonitoringImageUrl: resolveSecurityWebsiteSlotImage(
      content.timelineMonitoringImageUrl,
      'monitoring',
    ),
    techImageUrl: resolveSecurityWebsiteSlotImage(content.techImageUrl, 'tech'),
    clients: content.clients.map((client) => ({
      ...client,
      logoUrl: resolveSecurityWebsiteClientLogo(client.name, client.logoUrl),
    })),
  };
}

export async function fetchSecurityWebsiteContent(
  companyId?: string,
): Promise<SecurityWebsiteContent> {
  const resolvedId = companyId ?? (await resolveSecurityWebsiteCompanyId());
  const supabase = createSupabaseServiceClient();

  let raw: unknown = null;

  const published = await fetchPublishedTenantPublicSiteJson(resolvedId, 'security_marketing');
  if (published) {
    raw = published;
  } else {
    const { data, error } = await supabase.rpc('get_security_public_website', {
      p_company_id: resolvedId,
    });

    raw = data;
    if (error) {
      console.error('fetchSecurityWebsiteContent rpc:', error.message);
      const envelope = await loadSettingEnvelope(supabase, resolvedId);
      raw = envelope[MD_SETTINGS_ENVELOPE_KEYS.securityWebsite] ?? null;
    }
  }

  const content = mergeSecurityWebsiteContent(raw);
  const versioned = await ensureVersionedStorageImageUrls(resolvedId, content);

  const companyLogo = await getCompanyLogoUrl(resolvedId);
  return withBrochureDefaults({
    ...versioned,
    logoUrl: companyLogo ?? versioned.logoUrl,
  });
}
