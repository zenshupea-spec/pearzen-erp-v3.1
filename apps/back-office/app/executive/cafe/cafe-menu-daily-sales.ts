import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { calcMenuWeekdayVelocity, type MenuDailySaleRecord } from './cafe-menu-velocity';

export type { MenuDailySaleRecord };

export function groupMenuDailySales(
  rows: Array<{
    menu_item_id: string;
    sale_date: string;
    units_sold: number;
    sold_out: boolean;
  }>,
): Map<string, MenuDailySaleRecord[]> {
  const map = new Map<string, MenuDailySaleRecord[]>();
  for (const row of rows) {
    const list = map.get(row.menu_item_id) ?? [];
    list.push({
      saleDate: row.sale_date,
      unitsSold: Number(row.units_sold) || 0,
      soldOut: Boolean(row.sold_out),
    });
    map.set(row.menu_item_id, list);
  }
  return map;
}

export async function loadMenuDailySalesMap(companyId: string): Promise<Map<string, MenuDailySaleRecord[]>> {
  const supabase = createSupabaseServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - 120);

  const { data, error } = await supabase
    .from('cafe_menu_daily_sales')
    .select('menu_item_id, sale_date, units_sold, sold_out')
    .eq('company_id', companyId)
    .gte('sale_date', since.toISOString().slice(0, 10))
    .order('sale_date', { ascending: true });

  if (error) {
    console.error('loadMenuDailySalesMap:', error.message);
    return new Map();
  }

  if (!data?.length) {
    await backfillMenuDailySalesFromOrders(companyId);
    const { data: refetched } = await supabase
      .from('cafe_menu_daily_sales')
      .select('menu_item_id, sale_date, units_sold, sold_out')
      .eq('company_id', companyId)
      .gte('sale_date', since.toISOString().slice(0, 10));
    return groupMenuDailySales(refetched ?? []);
  }

  return groupMenuDailySales(data);
}

/** One-time seed from completed café orders when the daily-sales table is empty. */
export async function backfillMenuDailySalesFromOrders(companyId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - 120);

  const { data: orders } = await supabase
    .from('cafe_customer_orders')
    .select('completed_at, items')
    .eq('company_id', companyId)
    .eq('status', 'COMPLETED')
    .not('completed_at', 'is', null)
    .gte('completed_at', since.toISOString());

  const buckets = new Map<string, number>();
  for (const order of orders ?? []) {
    const saleDate = (order.completed_at as string).slice(0, 10);
    const items = (order.items as Array<{ menuItemId?: string; qty: number }>) ?? [];
    for (const line of items) {
      if (!line.menuItemId || !line.qty) continue;
      const key = `${line.menuItemId}:${saleDate}`;
      buckets.set(key, (buckets.get(key) ?? 0) + line.qty);
    }
  }

  if (!buckets.size) return;

  const rows = [...buckets.entries()].map(([key, units]) => {
    const sep = key.lastIndexOf(':');
    const menuItemId = key.slice(0, sep);
    const saleDate = key.slice(sep + 1);
    return {
      company_id: companyId,
      menu_item_id: menuItemId,
      sale_date: saleDate,
      units_sold: units,
      sold_out: false,
    };
  });

  await supabase.from('cafe_menu_daily_sales').upsert(rows, {
    onConflict: 'company_id,menu_item_id,sale_date',
  });
}

export async function recordMenuDailySalesFromOrder(
  companyId: string,
  items: Array<{ menuItemId?: string; qty: number }>,
  completedAt: string,
  historicalByMenuId: Map<string, MenuDailySaleRecord[]>,
): Promise<Map<string, MenuDailySaleRecord[]>> {
  const supabase = createSupabaseServiceClient();
  const saleDate = completedAt.slice(0, 10);
  const today = new Date(completedAt);
  const nextMap = new Map(historicalByMenuId);

  for (const line of items) {
    if (!line.menuItemId || line.qty <= 0) continue;

    const menuItemId = line.menuItemId;
    const { data: existing } = await supabase
      .from('cafe_menu_daily_sales')
      .select('units_sold')
      .eq('company_id', companyId)
      .eq('menu_item_id', menuItemId)
      .eq('sale_date', saleDate)
      .maybeSingle();

    const priorUnits = Number(existing?.units_sold) || 0;
    const newUnits = priorUnits + line.qty;

    const history = nextMap.get(menuItemId) ?? [];
    const velocity = calcMenuWeekdayVelocity(history, 0, undefined, today);
    const soldOut = velocity.referenceDaily > 0 && newUnits >= velocity.referenceDaily;

    await supabase.from('cafe_menu_daily_sales').upsert(
      {
        company_id: companyId,
        menu_item_id: menuItemId,
        sale_date: saleDate,
        units_sold: newUnits,
        sold_out: soldOut,
      },
      { onConflict: 'company_id,menu_item_id,sale_date' },
    );

    const updated = history.filter((row) => row.saleDate !== saleDate);
    updated.push({ saleDate, unitsSold: newUnits, soldOut });
    nextMap.set(menuItemId, updated);
  }

  return nextMap;
}
