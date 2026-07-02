'use server';

import { revalidatePath } from 'next/cache';

import { assertRetailVerticalAccessForSession } from '../../lib/retail-vertical-server';
import type {
  RetailCartLineItem,
  RetailCartRow,
  RetailDeskSummary,
  RetailOrderRow,
  RetailPaymentMethod,
  RetailProductRow,
} from '../../lib/retail-types';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';

const RETAIL_PATHS = ['/retail', '/retail/inventory', '/retail/checkout', '/retail/orders'] as const;

function revalidateRetailPaths() {
  for (const path of RETAIL_PATHS) {
    revalidatePath(path);
  }
}

async function requireRetailCompanyId(role: string | null | undefined): Promise<string> {
  const access = await assertRetailVerticalAccessForSession(role);
  if ('error' in access) {
    throw new Error(access.error);
  }
  return access.companyId;
}

function mapProduct(
  row: Record<string, unknown>,
  stock?: { quantity_on_hand?: number; reorder_level?: number },
): RetailProductRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name ?? ''),
    sku: row.sku != null ? String(row.sku) : null,
    unitPriceLkr: Number(row.unit_price_lkr ?? 0),
    isActive: row.is_active !== false,
    published: Boolean(row.published),
    stockOnHand: Number(stock?.quantity_on_hand ?? 0),
    reorderLevel: Number(stock?.reorder_level ?? 0),
  };
}

function mapCart(row: Record<string, unknown>): RetailCartRow {
  const rawLines = row.line_items;
  const lineItems = Array.isArray(rawLines) ? (rawLines as RetailCartLineItem[]) : [];

  return {
    id: String(row.id),
    companyId: String(row.company_id),
    cartCode: String(row.cart_code ?? ''),
    status: String(row.status ?? 'open') as RetailCartRow['status'],
    lineItems,
    notes: row.notes != null ? String(row.notes) : null,
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapOrder(
  row: Record<string, unknown>,
  lines: RetailOrderRow['lines'],
): RetailOrderRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    orderNumber: String(row.order_number ?? ''),
    status: String(row.status ?? 'pending') as RetailOrderRow['status'],
    totalLkr: Number(row.total_lkr ?? 0),
    paymentMethod: String(row.payment_method ?? 'cash') as RetailPaymentMethod,
    customerName: row.customer_name != null ? String(row.customer_name) : null,
    customerPhone: row.customer_phone != null ? String(row.customer_phone) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at ?? ''),
    lines,
  };
}

export async function fetchRetailDeskSummary(): Promise<RetailDeskSummary> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireRetailCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [products, stockLevels, openCarts, orders] = await Promise.all([
    db.from('retail_products').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    db.from('retail_stock_levels').select('quantity_on_hand, reorder_level').eq('company_id', companyId),
    db
      .from('retail_carts')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'open'),
    db
      .from('retail_orders')
      .select('total_lkr')
      .eq('company_id', companyId)
      .gte('created_at', startOfDay.toISOString()),
  ]);

  const lowStockCount = (stockLevels.data ?? []).filter((row) => {
    const qty = Number((row as { quantity_on_hand?: number }).quantity_on_hand ?? 0);
    const reorder = Number((row as { reorder_level?: number }).reorder_level ?? 0);
    return reorder > 0 && qty <= reorder;
  }).length;

  const todayOrderTotalLkr = (orders.data ?? []).reduce(
    (sum, row) => sum + Number((row as { total_lkr?: number }).total_lkr ?? 0),
    0,
  );

  return {
    productCount: products.count ?? 0,
    lowStockCount,
    openCarts: openCarts.count ?? 0,
    todayOrderTotalLkr,
  };
}

export async function fetchRetailProducts(): Promise<RetailProductRow[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireRetailCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const [productsResult, stockResult] = await Promise.all([
    db
      .from('retail_products')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true }),
    db.from('retail_stock_levels').select('*').eq('company_id', companyId),
  ]);

  if (productsResult.error) throw new Error(productsResult.error.message);

  const stockByProduct = new Map(
    (stockResult.data ?? []).map((row) => [
      String((row as { product_id: string }).product_id),
      row as { quantity_on_hand?: number; reorder_level?: number },
    ]),
  );

  return (productsResult.data ?? []).map((row) =>
    mapProduct(row as Record<string, unknown>, stockByProduct.get(String(row.id))),
  );
}

export async function fetchRetailOpenCart(): Promise<RetailCartRow | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireRetailCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const { data, error } = await db
    .from('retail_carts')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapCart(data as Record<string, unknown>) : null;
}

export async function fetchRetailOrders(): Promise<RetailOrderRow[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireRetailCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const { data: orders, error } = await db
    .from('retail_orders')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  if (!orders?.length) return [];

  const orderIds = orders.map((row) => String(row.id));
  const { data: lines, error: linesError } = await db
    .from('retail_order_lines')
    .select('*')
    .in('order_id', orderIds);

  if (linesError) throw new Error(linesError.message);

  const linesByOrder = (lines ?? []).reduce<Map<string, RetailOrderRow['lines']>>((map, row) => {
    const orderId = String((row as { order_id: string }).order_id);
    const bucket = map.get(orderId) ?? [];
    bucket.push({
      id: String(row.id),
      productId: row.product_id != null ? String(row.product_id) : null,
      productName: String(row.product_name ?? ''),
      quantity: Number(row.quantity ?? 0),
      unitPriceLkr: Number(row.unit_price_lkr ?? 0),
      lineTotalLkr: Number(row.line_total_lkr ?? 0),
    });
    map.set(orderId, bucket);
    return map;
  }, new Map());

  return orders.map((row) =>
    mapOrder(row as Record<string, unknown>, linesByOrder.get(String(row.id)) ?? []),
  );
}

export async function saveRetailProduct(input: {
  id?: string;
  name: string;
  sku?: string;
  unitPriceLkr: number;
  stockOnHand: number;
  reorderLevel: number;
  isActive: boolean;
  published: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireRetailCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const name = input.name.trim();
  if (!name) return { success: false as const, error: 'Product name is required.' };

  const productPayload = {
    company_id: companyId,
    name: name.toUpperCase(),
    sku: input.sku?.trim() || null,
    unit_price_lkr: Math.max(0, Number(input.unitPriceLkr)),
    is_active: input.isActive,
    published: input.published,
    updated_at: new Date().toISOString(),
  };

  let productId = input.id?.trim();

  if (productId) {
    const { error } = await db
      .from('retail_products')
      .update(productPayload)
      .eq('id', productId)
      .eq('company_id', companyId);
    if (error) return { success: false as const, error: error.message };
  } else {
    const { data, error } = await db
      .from('retail_products')
      .insert([productPayload])
      .select('id')
      .single();
    if (error) return { success: false as const, error: error.message };
    productId = String(data.id);
  }

  const stockPayload = {
    company_id: companyId,
    product_id: productId,
    quantity_on_hand: Math.max(0, Math.round(input.stockOnHand)),
    reorder_level: Math.max(0, Math.round(input.reorderLevel)),
    updated_at: new Date().toISOString(),
  };

  const { error: stockError } = await db.from('retail_stock_levels').upsert(stockPayload, {
    onConflict: 'company_id,product_id',
  });
  if (stockError) return { success: false as const, error: stockError.message };

  revalidateRetailPaths();
  return { success: true as const };
}

export async function ensureRetailOpenCart(): Promise<RetailCartRow> {
  const existing = await fetchRetailOpenCart();
  if (existing) return existing;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireRetailCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const cartCode = `CRT-${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await db
    .from('retail_carts')
    .insert([
      {
        company_id: companyId,
        cart_code: cartCode,
        status: 'open',
        line_items: [],
      },
    ])
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  revalidateRetailPaths();
  return mapCart(data as Record<string, unknown>);
}

export async function updateRetailCart(input: {
  cartId: string;
  lineItems: RetailCartLineItem[];
  notes?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireRetailCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const { error } = await db
    .from('retail_carts')
    .update({
      line_items: input.lineItems,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.cartId)
    .eq('company_id', companyId)
    .eq('status', 'open');

  if (error) return { success: false as const, error: error.message };

  revalidateRetailPaths();
  return { success: true as const };
}

export async function checkoutRetailCart(input: {
  cartId: string;
  paymentMethod: RetailPaymentMethod;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireRetailCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const { data: cart, error: cartError } = await db
    .from('retail_carts')
    .select('*')
    .eq('id', input.cartId)
    .eq('company_id', companyId)
    .eq('status', 'open')
    .maybeSingle();

  if (cartError) return { success: false as const, error: cartError.message };
  if (!cart) return { success: false as const, error: 'Open cart not found.' };

  const cartRow = mapCart(cart as Record<string, unknown>);
  if (!cartRow.lineItems.length) {
    return { success: false as const, error: 'Cart is empty.' };
  }

  const totalLkr = cartRow.lineItems.reduce((sum, line) => sum + line.lineTotalLkr, 0);
  const orderNumber = `RTL-${Date.now().toString(36).toUpperCase()}`;

  const { data: order, error: orderError } = await db
    .from('retail_orders')
    .insert([
      {
        company_id: companyId,
        cart_id: cartRow.id,
        order_number: orderNumber,
        status: 'paid',
        total_lkr: totalLkr,
        payment_method: input.paymentMethod,
        customer_name: input.customerName?.trim() || null,
        customer_phone: input.customerPhone?.trim() || null,
        notes: input.notes?.trim() || cartRow.notes,
        created_by_email: user?.email?.trim().toLowerCase() ?? null,
      },
    ])
    .select('id')
    .single();

  if (orderError) return { success: false as const, error: orderError.message };

  const orderId = String(order.id);
  const lineRows = cartRow.lineItems.map((line) => ({
    company_id: companyId,
    order_id: orderId,
    product_id: line.productId,
    product_name: line.productName,
    quantity: line.quantity,
    unit_price_lkr: line.unitPriceLkr,
    line_total_lkr: line.lineTotalLkr,
  }));

  const { error: linesError } = await db.from('retail_order_lines').insert(lineRows);
  if (linesError) return { success: false as const, error: linesError.message };

  for (const line of cartRow.lineItems) {
    const { data: stock } = await db
      .from('retail_stock_levels')
      .select('quantity_on_hand')
      .eq('company_id', companyId)
      .eq('product_id', line.productId)
      .maybeSingle();

    const current = Number((stock as { quantity_on_hand?: number } | null)?.quantity_on_hand ?? 0);
    const nextQty = Math.max(0, current - line.quantity);

    await db
      .from('retail_stock_levels')
      .upsert(
        {
          company_id: companyId,
          product_id: line.productId,
          quantity_on_hand: nextQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,product_id' },
      );
  }

  const { error: cartCloseError } = await db
    .from('retail_carts')
    .update({
      status: 'checked_out',
      updated_at: new Date().toISOString(),
    })
    .eq('id', cartRow.id)
    .eq('company_id', companyId);

  if (cartCloseError) return { success: false as const, error: cartCloseError.message };

  revalidateRetailPaths();
  return { success: true as const, orderNumber };
}
