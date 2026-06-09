import { createSupabaseBrowserClient } from './supabase';

export type PublicMenuItem = {
  id: string;
  name: string;
  category: string;
  categorySort: number;
  priceLkr: number;
  imageUrl: string | null;
};

export type PublicMenuBranding = {
  cafeName: string;
  logoUrl: string | null;
  coverUrl: string | null;
  coverTextColor: string;
};

export type FulfillmentType = 'dine-in' | 'takeout' | 'delivery';

export function customerMenuCompanyId(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID?.trim() ||
    process.env.CUSTOMER_MENU_COMPANY_ID?.trim();
  return raw || null;
}

export async function fetchPublicMenu(companyId: string): Promise<PublicMenuItem[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_cafe_public_menu', {
    p_company_id: companyId,
  });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.item_id),
    name: String(row.item_name),
    category: String(row.category_name),
    categorySort: Number(row.category_sort) || 0,
    priceLkr: Number(row.selling_price_lkr) || 0,
    imageUrl: row.image_url ? String(row.image_url) : null,
  }));
}

export async function fetchPublicBranding(companyId: string): Promise<PublicMenuBranding> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_cafe_public_branding', {
    p_company_id: companyId,
  });

  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { cafeName: 'Our Menu', logoUrl: null, coverUrl: null, coverTextColor: '#ffffff' };
  }

  return {
    cafeName: String(row.cafe_name || 'Our Menu'),
    logoUrl: row.logo_url ? String(row.logo_url) : null,
    coverUrl: row.cover_url ? String(row.cover_url) : null,
    coverTextColor: String(row.cover_text_color || '#ffffff'),
  };
}

export async function placeCustomerOrder(input: {
  companyId: string;
  fulfillmentType: FulfillmentType;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  items: Array<{ menuItemId: string; name: string; qty: number; unitPriceLkr: number }>;
  totalLkr: number;
}): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('place_cafe_customer_order', {
    p_company_id: input.companyId,
    p_fulfillment_type: input.fulfillmentType,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_delivery_address: input.deliveryAddress ?? '',
    p_items: input.items,
    p_total_lkr: input.totalLkr,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, orderId: data as string };
}
