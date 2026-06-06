const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** Single global counter for tax invoice sequence (legacy state used per-month keys). */
export const GLOBAL_TAX_SEQ_KEY = '__global__';

const TAX_INVOICE_SEQ_PAD = 5;

/** Prefix e.g. 26JUN for June 2026 — billing month in tax invoice numbers */
export function taxInvoiceMonthPrefix(date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mmm = MONTH_ABBR[date.getMonth()] ?? 'JAN';
  return `${yy}${mmm}`;
}

export function taxInvoiceMonthPrefixFromKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return taxInvoiceMonthPrefix();
  const d = new Date(y, m - 1, 1);
  return taxInvoiceMonthPrefix(d);
}

/**
 * Tax invoice number: YYMMMCVS##### — billing month prefix; ##### is one global
 * sequence (never reused after CVS on any invoice). Example: 15JANCVS00001 then 15FEBCVS00002.
 */
export function formatTaxInvoiceNumber(prefix: string, sequence: number): string {
  const seq = String(sequence).padStart(TAX_INVOICE_SEQ_PAD, '0');
  return `${prefix}CVS${seq}`;
}

function globalTaxSeqFromState(state: Record<string, number>): number {
  let max = state[GLOBAL_TAX_SEQ_KEY] ?? 0;
  for (const [key, n] of Object.entries(state)) {
    if (key === GLOBAL_TAX_SEQ_KEY) continue;
    max = Math.max(max, n);
  }
  return max;
}

function taxSeqStateWithGlobal(sequence: number): Record<string, number> {
  return { [GLOBAL_TAX_SEQ_KEY]: sequence };
}

export function nextTaxInvoiceSequence(
  prefix: string,
  seqState: Record<string, number>,
  usedNumbers: Set<string>,
  usedSequences: Set<number>,
): { number: string; nextState: Record<string, number> } {
  let seq = globalTaxSeqFromState(seqState) + 1;
  let nextState = taxSeqStateWithGlobal(seq);
  let candidate = formatTaxInvoiceNumber(prefix, seq);
  while (usedSequences.has(seq) || usedNumbers.has(candidate)) {
    seq += 1;
    nextState = taxSeqStateWithGlobal(seq);
    candidate = formatTaxInvoiceNumber(prefix, seq);
  }
  return { number: candidate, nextState };
}

export function collectUsedTaxInvoiceNumbers(
  clients: {
    invoices: Partial<Record<string, { taxInvoiceNo?: string } | undefined>>;
  }[],
): Set<string> {
  const used = new Set<string>();
  for (const c of clients) {
    for (const cell of Object.values(c.invoices)) {
      if (cell?.taxInvoiceNo) used.add(cell.taxInvoiceNo);
    }
  }
  return used;
}

/** Numeric suffix after CVS — must appear at most once across all invoices, ever */
export function collectUsedTaxInvoiceSequences(
  clients: {
    invoices: Partial<Record<string, { taxInvoiceNo?: string } | undefined>>;
  }[],
): Set<number> {
  const used = new Set<number>();
  for (const no of collectUsedTaxInvoiceNumbers(clients)) {
    const parsed = parseTaxInvoiceNumber(no);
    if (parsed) used.add(parsed.sequence);
  }
  return used;
}

/** Earliest month key — all billable invoices (status ≠ NONE) receive a tax number */
export const TAX_INVOICE_FROM_MONTH_KEY = '0000-01';

export function isBillableInvoiceCell(cell: { status?: string } | null | undefined): boolean {
  return cell != null && cell.status !== 'NONE';
}

export function shouldAssignTaxInvoiceNo(
  _monthKey: string,
  status?: string,
): boolean {
  return status != null && status !== 'NONE';
}

export function countMissingTaxInvoiceNumbers(
  clients: {
    invoices: Partial<Record<string, { status?: string; taxInvoiceNo?: string } | undefined>>;
  }[],
  fromMonthKey: string = TAX_INVOICE_FROM_MONTH_KEY,
): number {
  let missing = 0;
  for (const c of clients) {
    for (const [monthKey, cell] of Object.entries(c.invoices)) {
      if (!isBillableInvoiceCell(cell)) continue;
      if (monthKey < fromMonthKey) continue;
      if (!cell!.taxInvoiceNo) missing += 1;
    }
  }
  return missing;
}

export function parseTaxInvoiceNumber(
  no: string,
): { prefix: string; sequence: number } | null {
  const m = no.match(/^(\d{2}[A-Z]{3})CVS(\d+)$/);
  if (!m) return null;
  return { prefix: m[1]!, sequence: parseInt(m[2]!, 10) };
}

/** Highest global sequence already assigned on invoice cells */
export function deriveTaxSeqFromClients(
  clients: {
    invoices: Partial<Record<string, { taxInvoiceNo?: string } | undefined>>;
  }[],
): Record<string, number> {
  let max = 0;
  for (const no of collectUsedTaxInvoiceNumbers(clients)) {
    const parsed = parseTaxInvoiceNumber(no);
    if (parsed) max = Math.max(max, parsed.sequence);
  }
  return taxSeqStateWithGlobal(max);
}

function mergeTaxSeq(
  ...states: Record<string, number>[]
): Record<string, number> {
  let max = 0;
  for (const state of states) {
    max = Math.max(max, globalTaxSeqFromState(state));
  }
  return taxSeqStateWithGlobal(max);
}

type TaxInvoiceClient<T> = {
  clientId: string;
  invoices: Partial<
    Record<string, (T & { status?: string; taxInvoiceNo?: string }) | undefined>
  >;
};

/**
 * Keep the first occurrence of each CVS suffix; clear duplicates so they can be re-issued.
 */
export function dedupeTaxInvoiceSuffixes<
  T extends { status?: string; taxInvoiceNo?: string },
>(clients: TaxInvoiceClient<T>[]): { clients: TaxInvoiceClient<T>[]; changed: boolean } {
  const keptSeq = new Set<number>();
  const keptNo = new Set<string>();
  const entries: { clientIdx: number; monthKey: string }[] = [];

  clients.forEach((c, clientIdx) => {
    for (const [monthKey, cell] of Object.entries(c.invoices)) {
      if (cell?.taxInvoiceNo) entries.push({ clientIdx, monthKey });
    }
  });

  if (entries.length === 0) {
    return { clients, changed: false };
  }

  entries.sort(
    (a, b) =>
      a.monthKey.localeCompare(b.monthKey) ||
      clients[a.clientIdx]!.clientId.localeCompare(clients[b.clientIdx]!.clientId),
  );

  const nextClients = clients.map((c) => ({
    ...c,
    invoices: { ...c.invoices },
  }));
  let changed = false;

  for (const { clientIdx, monthKey } of entries) {
    const client = nextClients[clientIdx]!;
    const cell = client.invoices[monthKey];
    if (!cell?.taxInvoiceNo) continue;
    const parsed = parseTaxInvoiceNumber(cell.taxInvoiceNo);
    const seq = parsed?.sequence;
    const duplicate =
      !parsed ||
      keptNo.has(cell.taxInvoiceNo) ||
      (seq != null && keptSeq.has(seq));
    if (duplicate) {
      const { taxInvoiceNo: _removed, ...rest } = cell;
      client.invoices[monthKey] = rest as typeof cell;
      changed = true;
      continue;
    }
    keptNo.add(cell.taxInvoiceNo);
    if (seq != null) keptSeq.add(seq);
  }

  return { clients: nextClients, changed };
}

/**
 * Assign permanent tax invoice numbers to every billable invoice that does not yet have
 * one (as soon as the invoice exists — not at print). YYMMM reflects the billing month;
 * digits after CVS are one global sequence (00001, 00002, …) never reused.
 */
export function assignMissingTaxInvoiceNumbers<
  T extends { status?: string; taxInvoiceNo?: string },
>(
  clients: TaxInvoiceClient<T>[],
  seqState: Record<string, number>,
  fromMonthKey: string = TAX_INVOICE_FROM_MONTH_KEY,
): { clients: TaxInvoiceClient<T>[]; nextSeq: Record<string, number>; changed: boolean } {
  const { clients: deduped, changed: dedupedChanged } = dedupeTaxInvoiceSuffixes(clients);

  const usedNumbers = collectUsedTaxInvoiceNumbers(deduped);
  const usedSequences = collectUsedTaxInvoiceSequences(deduped);
  let seq = mergeTaxSeq(seqState, deriveTaxSeqFromClients(deduped));
  const pending: { clientIdx: number; monthKey: string }[] = [];

  deduped.forEach((c, clientIdx) => {
    for (const [monthKey, cell] of Object.entries(c.invoices)) {
      if (!cell || cell.status === 'NONE') continue;
      if (monthKey < fromMonthKey) continue;
      if (cell.taxInvoiceNo) continue;
      pending.push({ clientIdx, monthKey });
    }
  });

  if (pending.length === 0) {
    return { clients: deduped, nextSeq: seq, changed: dedupedChanged };
  }

  pending.sort(
    (a, b) =>
      a.monthKey.localeCompare(b.monthKey) ||
      deduped[a.clientIdx]!.clientId.localeCompare(deduped[b.clientIdx]!.clientId),
  );

  const nextClients = deduped.map((c) => ({
    ...c,
    invoices: { ...c.invoices },
  }));

  for (const { clientIdx, monthKey } of pending) {
    const client = nextClients[clientIdx]!;
    const cell = client.invoices[monthKey];
    if (!cell) continue;
    const prefix = taxInvoiceMonthPrefixFromKey(monthKey);
    const allocated = nextTaxInvoiceSequence(prefix, seq, usedNumbers, usedSequences);
    seq = allocated.nextState;
    usedNumbers.add(allocated.number);
    const parsed = parseTaxInvoiceNumber(allocated.number);
    if (parsed) usedSequences.add(parsed.sequence);
    client.invoices[monthKey] = { ...cell, taxInvoiceNo: allocated.number };
  }

  return {
    clients: nextClients,
    nextSeq: seq,
    changed: dedupedChanged || pending.length > 0,
  };
}

/** Date of invoice on print — DD/MM/YYYY (e.g. 04/01/2026) */
export function formatInvoicePrintDate(date: Date = new Date()): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

const BELOW_20 = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'] as const;

function intToWords(n: number): string {
  if (n < 20) return BELOW_20[n] ?? String(n);
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return r ? `${TENS[t]}-${BELOW_20[r]}` : TENS[t];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return r ? `${BELOW_20[h]} Hundred ${intToWords(r)}` : `${BELOW_20[h]} Hundred`;
  }
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    const r = n % 1000;
    return r ? `${intToWords(th)} Thousand ${intToWords(r)}` : `${intToWords(th)} Thousand`;
  }
  const m = Math.floor(n / 1_000_000);
  const r = n % 1_000_000;
  return r ? `${intToWords(m)} Million ${intToWords(r)}` : `${intToWords(m)} Million`;
}

/** Total consideration in words for the tax invoice footer */
export function lkrAmountInWords(amount: number): string {
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  let text = `Sri Lanka Rupees ${intToWords(whole)}`;
  if (cents > 0) text += ` and Cents ${intToWords(cents)}`;
  return `${text} only`;
}
