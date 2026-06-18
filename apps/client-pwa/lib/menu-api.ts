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
  coverTintStrength: number;
  showItemImages: boolean;
  cafeOpenStart: string;
  cafeOpenEnd: string;
};

export type FulfillmentType = 'dine-in' | 'takeout' | 'delivery';

export type CafePaymentMethod = 'card_online' | 'cash_at_counter';

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
    return {
      cafeName: 'Our Menu',
      logoUrl: null,
      coverUrl: null,
      coverTextColor: '#ffffff',
      coverTintStrength: 100,
      showItemImages: true,
      cafeOpenStart: '07:00',
      cafeOpenEnd: '19:00',
    };
  }

  return {
    cafeName: String(row.cafe_name || 'Our Menu'),
    logoUrl: row.logo_url ? String(row.logo_url) : null,
    coverUrl: row.cover_url ? String(row.cover_url) : null,
    coverTextColor: String(row.cover_text_color || '#ffffff'),
    coverTintStrength: Number(row.cover_tint_strength ?? 100) || 100,
    showItemImages: row.show_item_images !== false,
    cafeOpenStart: String(row.cafe_open_start || '07:00'),
    cafeOpenEnd: String(row.cafe_open_end || '19:00'),
  };
}

export async function lookupCafeCustomerByPhone(
  companyId: string,
  phone: string,
): Promise<{
  customerName: string;
  discountPct: number;
  totalSpentLkr: number;
  orderCount: number;
} | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('lookup_cafe_customer_by_phone', {
    p_company_id: companyId,
    p_phone: phone,
  });

  if (error || !data?.length) return null;

  const row = data[0] as Record<string, unknown>;
  return {
    customerName: String(row.customer_name ?? ''),
    discountPct: Number(row.discount_pct) || 0,
    totalSpentLkr: Number(row.total_spent_lkr) || 0,
    orderCount: Number(row.order_count) || 0,
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
  paymentMethod?: CafePaymentMethod;
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
    p_payment_method: input.paymentMethod ?? 'card_online',
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, orderId: data as string };
}
