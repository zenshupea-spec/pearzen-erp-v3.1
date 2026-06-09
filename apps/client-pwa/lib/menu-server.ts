import { createClient } from '@supabase/supabase-js';

import type { PublicMenuBranding, PublicMenuItem } from './menu-api';
import { customerMenuCompanyId } from './menu-api';

function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function loadPublicMenuPageData(): Promise<{
  companyId: string | null;
  items: PublicMenuItem[];
  branding: PublicMenuBranding;
  error: string | null;
}> {
  const companyId = customerMenuCompanyId();
  const fallbackBranding: PublicMenuBranding = {
    cafeName: 'Café Tasha',
    logoUrl: null,
    coverUrl: null,
    coverTextColor: '#ffffff',
  };

  if (!companyId) {
    return {
      companyId: null,
      items: [],
      branding: fallbackBranding,
      error: 'Menu is not configured yet (missing CUSTOMER_MENU_COMPANY_ID).',
    };
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return {
      companyId,
      items: [],
      branding: fallbackBranding,
      error: 'Menu backend is not configured (Supabase env missing).',
    };
  }

  const [menuRes, brandingRes] = await Promise.all([
    supabase.rpc('get_cafe_public_menu', { p_company_id: companyId }),
    supabase.rpc('get_cafe_public_branding', { p_company_id: companyId }),
  ]);

  if (menuRes.error) {
    return {
      companyId,
      items: [],
      branding: fallbackBranding,
      error: menuRes.error.message,
    };
  }

  const items: PublicMenuItem[] = (menuRes.data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.item_id),
    name: String(row.item_name),
    category: String(row.category_name),
    categorySort: Number(row.category_sort) || 0,
    priceLkr: Number(row.selling_price_lkr) || 0,
    imageUrl: row.image_url ? String(row.image_url) : null,
  }));

  const brandingRow = Array.isArray(brandingRes.data) ? brandingRes.data[0] : brandingRes.data;
  const branding: PublicMenuBranding = brandingRow
    ? {
        cafeName: String(brandingRow.cafe_name || 'Our Menu'),
        logoUrl: brandingRow.logo_url ? String(brandingRow.logo_url) : null,
        coverUrl: brandingRow.cover_url ? String(brandingRow.cover_url) : null,
        coverTextColor: String(brandingRow.cover_text_color || '#ffffff'),
      }
    : fallbackBranding;

  return { companyId, items, branding, error: null };
}
