/**
 * Pears super-app inventory read hook — café menu, retail, and salon catalogs (read-only).
 */

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  fetchSuperappListingConsent,
  isSuperappListingActive,
  superappExportErrorStatus,
  type SuperappListingConsent,
} from './superapp-listing-consent';

export const SUPERAPP_INVENTORY_VERSION = 1;

export type SuperappInventoryVertical = 'cafe' | 'retail' | 'salon';

export type SuperappCafeMenuItem = {
  id: string;
  name: string;
  categoryName: string;
  categorySort: number;
  sellingPriceLkr: number;
  imageUrl: string | null;
};

export type SuperappRetailProduct = {
  id: string;
  name: string;
  sku: string | null;
  unitPriceLkr: number;
  quantityOnHand: number | null;
};

export type SuperappSalonProduct = {
  id: string;
  name: string;
  sku: string | null;
  unitPriceLkr: number;
  stockOnHand: number;
};

export type SuperappInventoryPayload = {
  version: typeof SUPERAPP_INVENTORY_VERSION;
  exportedAt: string;
  companyId: string;
  listingConsent: {
    active: boolean;
    listProducts: boolean;
    listBooking: boolean;
    consentedAt: string | null;
  };
  cafe: { items: SuperappCafeMenuItem[]; count: number } | null;
  retail: { products: SuperappRetailProduct[]; count: number } | null;
  salon: { products: SuperappSalonProduct[]; count: number } | null;
};

function parseVerticalFilter(raw: string | null): SuperappInventoryVertical[] | null {
  if (!raw?.trim()) return null;
  const allowed = new Set<SuperappInventoryVertical>(['cafe', 'retail', 'salon']);
  const selected = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is SuperappInventoryVertical =>
      allowed.has(part as SuperappInventoryVertical),
    );
  return selected.length > 0 ? selected : null;
}

async function assertCompanyExists(companyId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Company not found.');
}

async function fetchPublishedCafeMenu(companyId: string): Promise<SuperappCafeMenuItem[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc('get_cafe_public_menu', {
    p_company_id: companyId,
  });

  if (error) {
    if (error.code === '42883' || error.code === '42P01') return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.item_id ?? row.id ?? ''),
    name: String(row.item_name ?? row.name ?? ''),
    categoryName: String(row.category_name ?? ''),
    categorySort: Number(row.category_sort ?? 0),
    sellingPriceLkr: Number(row.selling_price_lkr ?? 0),
    imageUrl: row.image_url != null ? String(row.image_url) : null,
  }));
}

async function fetchPublishedRetailProducts(companyId: string): Promise<SuperappRetailProduct[]> {
  const supabase = createSupabaseServiceClient();
  const { data: products, error: productsError } = await supabase
    .from('retail_products')
    .select('id, name, sku, unit_price_lkr')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('published', true)
    .order('name', { ascending: true });

  if (productsError) {
    if (productsError.code === '42P01') return [];
    throw new Error(productsError.message);
  }

  const productIds = (products ?? []).map((row) => String(row.id));
  const stockByProduct = new Map<string, number>();

  if (productIds.length > 0) {
    const { data: stockRows, error: stockError } = await supabase
      .from('retail_stock_levels')
      .select('product_id, quantity_on_hand')
      .eq('company_id', companyId)
      .in('product_id', productIds);

    if (stockError && stockError.code !== '42P01') {
      throw new Error(stockError.message);
    }

    for (const row of stockRows ?? []) {
      stockByProduct.set(String(row.product_id), Number(row.quantity_on_hand ?? 0));
    }
  }

  return (products ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    sku: row.sku != null ? String(row.sku) : null,
    unitPriceLkr: Number(row.unit_price_lkr ?? 0),
    quantityOnHand: stockByProduct.get(String(row.id)) ?? null,
  }));
}

async function fetchPublishedSalonProducts(companyId: string): Promise<SuperappSalonProduct[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('salon_products')
    .select('id, name, sku, unit_price_lkr, stock_on_hand')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    sku: row.sku != null ? String(row.sku) : null,
    unitPriceLkr: Number(row.unit_price_lkr ?? 0),
    stockOnHand: Number(row.stock_on_hand ?? 0),
  }));
}

export async function buildSuperappInventoryPayload(input: {
  companyId: string;
  verticals?: SuperappInventoryVertical[] | null;
  requireConsent?: boolean;
}): Promise<SuperappInventoryPayload> {
  await assertCompanyExists(input.companyId);

  const consent = await fetchSuperappListingConsent(input.companyId);
  const consentBlock = mapConsentBlock(consent);

  if (input.requireConsent !== false && !isSuperappListingActive(consent)) {
    throw new Error('Listing consent not granted for this tenant.');
  }

  const includeAll = !input.verticals?.length;
  const include = new Set(input.verticals ?? []);
  const allowProducts = Boolean(consent?.consentedAt && consent.listProducts);

  const [cafeItems, retailProducts, salonProducts] = await Promise.all([
    allowProducts && (includeAll || include.has('cafe'))
      ? fetchPublishedCafeMenu(input.companyId)
      : Promise.resolve(null),
    allowProducts && (includeAll || include.has('retail'))
      ? fetchPublishedRetailProducts(input.companyId)
      : Promise.resolve(null),
    allowProducts && (includeAll || include.has('salon'))
      ? fetchPublishedSalonProducts(input.companyId)
      : Promise.resolve(null),
  ]);

  return {
    version: SUPERAPP_INVENTORY_VERSION,
    exportedAt: new Date().toISOString(),
    companyId: input.companyId,
    listingConsent: consentBlock,
    cafe:
      cafeItems == null
        ? null
        : {
            items: cafeItems,
            count: cafeItems.length,
          },
    retail:
      retailProducts == null
        ? null
        : {
            products: retailProducts,
            count: retailProducts.length,
          },
    salon:
      salonProducts == null
        ? null
        : {
            products: salonProducts,
            count: salonProducts.length,
          },
  };
}

function mapConsentBlock(consent: SuperappListingConsent | null) {
  return {
    active: isSuperappListingActive(consent),
    listProducts: Boolean(consent?.listProducts && consent.consentedAt),
    listBooking: Boolean(consent?.listBooking && consent.consentedAt),
    consentedAt: consent?.consentedAt ?? null,
  };
}

export function parseSuperappInventoryVerticals(
  raw: string | null,
): SuperappInventoryVertical[] | null {
  return parseVerticalFilter(raw);
}
