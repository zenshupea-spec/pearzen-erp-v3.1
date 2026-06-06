import { createSupabaseServiceClient } from './service';

const BRANDING_BUCKET = 'company-branding';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

async function resolveCompanyId(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  companyId?: string | null,
): Promise<string | null> {
  if (companyId) return companyId;
  const { data } = await supabase.from('companies').select('id').ilike('name', '%CLASSIC%').limit(1).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: any } = await supabase.from('companies').select('id').limit(1).maybeSingle();
  return any?.id ?? null;
}

const HQ_MASTER_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

async function readLogoUrlForCompany(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('md_settings')
    .select('company_logo_url')
    .eq('company_id', companyId)
    .maybeSingle();

  const url = (data as { company_logo_url?: string | null } | null)?.company_logo_url;
  return url?.trim() || null;
}

/**
 * Logo uploaded in MD Settings — used by guard portal watermark and executive sidebar.
 * Falls back to HQ master / any tenant row when Classic Venture has no logo yet.
 */
export async function getCompanyLogoUrl(companyId?: string | null): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const resolvedId = await resolveCompanyId(supabase, companyId);

  if (resolvedId) {
    const primary = await readLogoUrlForCompany(supabase, resolvedId);
    if (primary) return primary;
  }

  const hqLogo = await readLogoUrlForCompany(supabase, HQ_MASTER_COMPANY_ID);
  if (hqLogo) return hqLogo;

  const { data: anyRow } = await supabase
    .from('md_settings')
    .select('company_logo_url')
    .not('company_logo_url', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const fallback = (anyRow as { company_logo_url?: string | null } | null)?.company_logo_url;
  return fallback?.trim() || null;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string; ext: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_LOGO_BYTES) return null;
  const ext =
    mime === 'image/svg+xml'
      ? 'svg'
      : mime === 'image/webp'
        ? 'webp'
        : mime === 'image/jpeg'
          ? 'jpg'
          : 'png';
  return { buffer, mime, ext };
}

export async function saveCompanyLogo(
  dataUrl: string,
  companyId?: string | null,
): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  if (!dataUrl.startsWith('data:')) {
    return { success: false, error: 'Invalid logo data' };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { success: false, error: 'Logo must be under 2MB and a valid image' };
  }

  const supabase = createSupabaseServiceClient();
  const resolvedId = await resolveCompanyId(supabase, companyId);
  if (!resolvedId) {
    return { success: false, error: 'No company found' };
  }

  const path = `${resolvedId}/logo.${parsed.ext}`;
  let publicUrl = dataUrl;

  const { error: uploadError } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, parsed.buffer, {
      contentType: parsed.mime,
      upsert: true,
    });

  if (!uploadError) {
    const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path);
    publicUrl = data.publicUrl;
  }

  const { error } = await supabase.from('md_settings').upsert(
    { company_id: resolvedId, company_logo_url: publicUrl },
    { onConflict: 'company_id' },
  );

  if (error) return { success: false, error: error.message };
  return { success: true, url: publicUrl };
}

export async function removeCompanyLogo(companyId?: string | null): Promise<{ success: boolean; error?: string }> {
  const supabase = createSupabaseServiceClient();
  const resolvedId = await resolveCompanyId(supabase, companyId);
  if (!resolvedId) return { success: false, error: 'No company found' };

  const { error } = await supabase
    .from('md_settings')
    .upsert({ company_id: resolvedId, company_logo_url: null }, { onConflict: 'company_id' });

  if (error) return { success: false, error: error.message };
  return { success: true };
}
