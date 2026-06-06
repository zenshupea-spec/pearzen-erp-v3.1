import type { UniformStockLine } from '../uniform-vo-stock';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StockDb = any;

export function isMissingUniformStockItemsTable(message: string): boolean {
  return (
    message.includes('42P01') ||
    message.includes('uniform_stock_items') ||
    message.toLowerCase().includes('does not exist')
  );
}

export async function deductHqUniformWarehouseStock(
  db: StockDb,
  companyId: string,
  items: UniformStockLine[],
): Promise<{ ok: true } | { error: string }> {
  const now = new Date().toISOString();

  for (const line of items) {
    const { data: row, error: fetchErr } = await db
      .from('uniform_stock_items')
      .select('id, quantity_in_stock')
      .eq('company_id', companyId)
      .eq('item_name', line.item)
      .maybeSingle();

    if (fetchErr) {
      if (isMissingUniformStockItemsTable(fetchErr.message)) {
        return { error: 'HQ uniform stock is not set up. Run migrations and add items on Uniform stock.' };
      }
      return { error: fetchErr.message };
    }

    if (!row) {
      return {
        error: `No HQ warehouse row for "${line.item}". Add it under Deductions → Uniform stock first.`,
      };
    }

    const available = Number(row.quantity_in_stock ?? 0);
    if (line.qty > available) {
      return {
        error: `Insufficient HQ stock for "${line.item}" (have ${available}, need ${line.qty}).`,
      };
    }
  }

  for (const line of items) {
    const { data: row } = await db
      .from('uniform_stock_items')
      .select('id, quantity_in_stock')
      .eq('company_id', companyId)
      .eq('item_name', line.item)
      .maybeSingle();

    const available = Number(row?.quantity_in_stock ?? 0);
    const { error } = await db
      .from('uniform_stock_items')
      .update({ quantity_in_stock: available - line.qty, updated_at: now })
      .eq('id', row.id)
      .gte('quantity_in_stock', line.qty);

    if (error) {
      return { error: `Could not deduct HQ stock for "${line.item}".` };
    }
  }

  return { ok: true };
}
