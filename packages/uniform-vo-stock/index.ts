export type UniformVoStockRow = {
  itemName: string;
  quantityOnHand: number;
};

export type UniformStockLine = { item: string; qty: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StockDb = any;

export function isMissingUniformVoStockTable(message: string): boolean {
  return (
    message.includes('42P01') ||
    message.includes('uniform_vo_stock') ||
    message.toLowerCase().includes('does not exist')
  );
}

export async function fetchUniformVoStockOnHand(
  db: StockDb,
  companyId: string,
  holderEpf: string,
): Promise<UniformVoStockRow[]> {
  const epf = holderEpf.trim().toUpperCase();
  const { data, error } = await db
    .from('uniform_vo_stock')
    .select('item_name, quantity_on_hand')
    .eq('company_id', companyId)
    .eq('holder_epf', epf)
    .order('item_name', { ascending: true });

  if (error) {
    if (isMissingUniformVoStockTable(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    itemName: row.item_name,
    quantityOnHand: Number(row.quantity_on_hand ?? 0),
  }));
}

export function voStockQuantityMap(rows: UniformVoStockRow[]): Map<string, number> {
  return new Map(rows.map((r) => [r.itemName, r.quantityOnHand]));
}

export async function deductUniformVoStock(
  db: StockDb,
  companyId: string,
  holderEpf: string,
  items: UniformStockLine[],
): Promise<{ ok: true } | { error: string }> {
  const epf = holderEpf.trim().toUpperCase();
  const onHand = voStockQuantityMap(await fetchUniformVoStockOnHand(db, companyId, epf));

  for (const line of items) {
    const available = onHand.get(line.item) ?? 0;
    if (line.qty > available) {
      return {
        error: `Insufficient "${line.item}" on hand (have ${available}, need ${line.qty}). Ask HQ to allocate stock to you.`,
      };
    }
  }

  const now = new Date().toISOString();
  for (const line of items) {
    const nextQty = (onHand.get(line.item) ?? 0) - line.qty;
    const { error } = await db
      .from('uniform_vo_stock')
      .update({ quantity_on_hand: nextQty, updated_at: now })
      .eq('company_id', companyId)
      .eq('holder_epf', epf)
      .eq('item_name', line.item)
      .gte('quantity_on_hand', line.qty);

    if (error) {
      if (isMissingUniformVoStockTable(error.message)) {
        return {
          error:
            'VO stock is not set up yet. Run database migrations, then ask HQ to allocate uniform stock to your EPF.',
        };
      }
      return { error: `Could not deduct stock for "${line.item}".` };
    }
    onHand.set(line.item, nextQty);
  }

  return { ok: true };
}

export async function restoreUniformVoStock(
  db: StockDb,
  companyId: string,
  holderEpf: string,
  items: UniformStockLine[],
): Promise<void> {
  const epf = holderEpf.trim().toUpperCase();
  const now = new Date().toISOString();

  for (const line of items) {
    const { data: existing } = await db
      .from('uniform_vo_stock')
      .select('quantity_on_hand')
      .eq('company_id', companyId)
      .eq('holder_epf', epf)
      .eq('item_name', line.item)
      .maybeSingle();

    const current = Number(existing?.quantity_on_hand ?? 0);
    await db.from('uniform_vo_stock').upsert(
      {
        company_id: companyId,
        holder_epf: epf,
        item_name: line.item,
        quantity_on_hand: current + line.qty,
        updated_at: now,
      },
      { onConflict: 'company_id,holder_epf,item_name' },
    );
  }
}
