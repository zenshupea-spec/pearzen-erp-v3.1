import { createSupabaseServiceClient } from './service';

async function resolveCompanyId(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
): Promise<string | null> {
  const { data } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', '%CLASSIC%')
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id as string;
  const { data: any } = await supabase.from('companies').select('id').limit(1).maybeSingle();
  return any?.id ?? null;
}

/**
 * Café Tasha logo from location settings — used on café front login and customer menu.
 */
export async function getCafeLogoUrl(): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const companyId = await resolveCompanyId(supabase);
  if (!companyId) return null;

  const { data: location } = await supabase
    .from('cafe_locations')
    .select('logo_url')
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();

  const locationLogo = (location as { logo_url?: string | null } | null)?.logo_url?.trim();
  if (locationLogo) return locationLogo;

  const { data: snapshot } = await supabase
    .from('cafe_dashboard_snapshots')
    .select('payload')
    .eq('company_id', companyId)
    .maybeSingle();

  const payload = snapshot?.payload;
  if (payload && typeof payload === 'object' && 'cafeLogoUrl' in payload) {
    const url = (payload as { cafeLogoUrl?: string | null }).cafeLogoUrl?.trim();
    if (url) return url;
  }

  return null;
}
