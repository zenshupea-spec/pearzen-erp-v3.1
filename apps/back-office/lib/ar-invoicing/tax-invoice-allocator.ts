import type { SupabaseClient } from '@supabase/supabase-js';
import {
  GLOBAL_TAX_SEQ_KEY,
  assignMissingTaxInvoiceNumbers,
  countMissingTaxInvoiceNumbers,
  deriveTaxSeqFromClients,
} from '../invoice-desk/tax-invoice';
import type { ArLedgerClientRecord } from './live-ledger';

export function globalTaxSeqFromState(state: Record<string, number>): number {
  let max = state[GLOBAL_TAX_SEQ_KEY] ?? 0;
  for (const [key, value] of Object.entries(state)) {
    if (key === GLOBAL_TAX_SEQ_KEY) continue;
    max = Math.max(max, value);
  }
  return max;
}

export function taxSeqStateFromGlobal(sequence: number): Record<string, number> {
  return { [GLOBAL_TAX_SEQ_KEY]: sequence };
}

export async function loadTaxSequenceCounter(
  db: SupabaseClient,
  companyId: string,
): Promise<number> {
  const { data, error } = await db
    .from('ar_tax_invoice_sequences')
    .select('last_sequence')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    console.error('❌ SUPABASE ERROR (loadTaxSequenceCounter):', error.message);
    return 0;
  }

  return data?.last_sequence ?? 0;
}

export async function syncTaxSequenceCounter(
  db: SupabaseClient,
  companyId: string,
  lastSequence: number,
): Promise<void> {
  const { error } = await db.from('ar_tax_invoice_sequences').upsert(
    {
      company_id: companyId,
      last_sequence: lastSequence,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id' },
  );

  if (error) {
    console.error('❌ SUPABASE ERROR (syncTaxSequenceCounter):', error.message);
  }
}

export async function mergeAuthoritativeTaxSeq(
  db: SupabaseClient,
  companyId: string,
  snapshotTaxSeq: Record<string, number> | null | undefined,
  clients: ArLedgerClientRecord[],
): Promise<Record<string, number>> {
  const counter = await loadTaxSequenceCounter(db, companyId);
  const snapshotMax = globalTaxSeqFromState(snapshotTaxSeq ?? {});
  const derivedMax = globalTaxSeqFromState(deriveTaxSeqFromClients(clients));
  const merged = Math.max(counter, snapshotMax, derivedMax);

  if (merged > counter) {
    await syncTaxSequenceCounter(db, companyId, merged);
  }

  return taxSeqStateFromGlobal(merged);
}

/**
 * Optimistic compare-and-swap: advance counter from `expectedCurrent` by `count`.
 * Returns false when another session won the race — caller should retry.
 */
export async function casReserveTaxSequences(
  db: SupabaseClient,
  companyId: string,
  expectedCurrent: number,
  count: number,
): Promise<boolean> {
  if (count <= 0) return true;

  const newLast = expectedCurrent + count;
  const { data: row, error: readError } = await db
    .from('ar_tax_invoice_sequences')
    .select('last_sequence')
    .eq('company_id', companyId)
    .maybeSingle();

  if (readError) {
    console.error('❌ SUPABASE ERROR (casReserveTaxSequences read):', readError.message);
    return false;
  }

  const actual = row?.last_sequence ?? 0;
  if (actual !== expectedCurrent) return false;

  if (row) {
    const { data: updated, error: updateError } = await db
      .from('ar_tax_invoice_sequences')
      .update({
        last_sequence: newLast,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('last_sequence', expectedCurrent)
      .select('last_sequence')
      .maybeSingle();

    if (updateError) {
      console.error('❌ SUPABASE ERROR (casReserveTaxSequences update):', updateError.message);
      return false;
    }

    return updated != null;
  }

  const { error: insertError } = await db.from('ar_tax_invoice_sequences').insert({
    company_id: companyId,
    last_sequence: newLast,
  });

  if (insertError) {
    console.error('❌ SUPABASE ERROR (casReserveTaxSequences insert):', insertError.message);
    return false;
  }

  return true;
}

/** Keep server-assigned tax invoice numbers when the desk saves collection edits. */
export function mergePreservedTaxInvoiceNumbers(
  existingClients: ArLedgerClientRecord[],
  incomingClients: ArLedgerClientRecord[],
): ArLedgerClientRecord[] {
  const existingById = new Map(existingClients.map((client) => [client.clientId, client]));

  return incomingClients.map((client) => {
    const existing = existingById.get(client.clientId);
    if (!existing) return client;

    const invoices = { ...client.invoices };
    for (const [monthKey, existingCell] of Object.entries(existing.invoices)) {
      const taxInvoiceNo = existingCell?.taxInvoiceNo;
      if (!taxInvoiceNo) continue;
      const incomingCell = invoices[monthKey];
      if (incomingCell && incomingCell.status !== 'NONE') {
        invoices[monthKey] = { ...incomingCell, taxInvoiceNo };
      }
    }

    return { ...client, invoices };
  });
}

export type TaxInvoiceAllocationResult = {
  clients: ArLedgerClientRecord[];
  taxSeq: Record<string, number>;
  changed: boolean;
};

/** Assign missing tax numbers from an already-reserved sequence block. */
export function assignReservedTaxInvoiceNumbers(
  clients: ArLedgerClientRecord[],
  reservedFrom: number,
): TaxInvoiceAllocationResult {
  const missing = countMissingTaxInvoiceNumbers(clients);
  if (missing === 0) {
    return { clients, taxSeq: taxSeqStateFromGlobal(reservedFrom), changed: false };
  }

  const { clients: assigned, nextSeq, changed } = assignMissingTaxInvoiceNumbers(clients, {
    [GLOBAL_TAX_SEQ_KEY]: reservedFrom,
  });

  return { clients: assigned, taxSeq: nextSeq, changed };
}
