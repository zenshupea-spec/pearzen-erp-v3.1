import type { InvoiceBillingClient, SupplierInvoiceProfile } from './types';
import { formatInvoicePrintDate, lkrAmountInWords } from './tax-invoice';
import { formatInvoiceDueDateLabel } from '../ar-invoicing/month-window';

/** A4 at 96 CSS px/in — used for screen preview and PDF capture. */
export const INVOICE_A4_WIDTH_PX = 794;
export const INVOICE_A4_HEIGHT_PX = 1123;
/** Screen preview scale (slightly smaller than 1:1 A4). */
export const INVOICE_PREVIEW_SCALE = 0.75;

type RankLine = {
  rank: string;
  headcount: number;
  shiftsPerHead: number;
  ratePerShift: number;
  isEventBill?: boolean;
  eventLabel?: string;
};

type PatrolLine = {
  visitId: string;
  date: string;
  sm: string;
  charge: number;
};

type DeductionLine = {
  incidentRef: string;
  deductionThisMonth: number;
};

type CreditLine = {
  id: string;
  reason: string;
  amount: number;
};

export interface TaxInvoiceDocumentInput {
  billingClient: InvoiceBillingClient;
  supplier: SupplierInvoiceProfile;
  monthLabel: string;
  taxInvoiceNo: string;
  invoiceDate: string;
  vatRate: number;
  ssclRate: number;
  rankLines: RankLine[];
  patrols: PatrolLine[];
  deductions: DeductionLine[];
  creditNotes: CreditLine[];
  rolloverDebt: number;
  rolloverFromMonth?: string;
  dueDate?: string;
  companyLogoUrl?: string | null;
  copyLabel?: 'CUSTOMER COPY' | 'DUPLICATE';
}

function money(n: number): string {
  return n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Avoid stale cached logos after MD re-uploads the same storage path. */
function cacheBustLogoUrl(url: string): string {
  if (url.startsWith('data:')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${Date.now()}`;
}

function serviceDescription(billing: InvoiceBillingClient, monthLabel: string): string {
  const site = billing.sector?.trim() || billing.clientName;
  return `Providing security coverage to ${site} — ${monthLabel}`;
}

function computeTotals(input: {
  rankLines: RankLine[];
  patrols: PatrolLine[];
  deductions: DeductionLine[];
  creditNotes: CreditLine[];
  rolloverDebt: number;
  vatRate: number;
  ssclRate: number;
}) {
  const netAmount =
    input.rankLines.reduce((s, l) => s + l.headcount * l.shiftsPerHead * l.ratePerShift, 0) +
    input.patrols.reduce((s, p) => s + p.charge, 0) +
    input.rolloverDebt -
    input.deductions.reduce((s, d) => s + d.deductionThisMonth, 0);

  const creditTotal = input.creditNotes.reduce((s, c) => s + c.amount, 0);
  const taxableBase = Math.max(0, netAmount - creditTotal);
  const ssclAmount = (taxableBase * input.ssclRate) / 100;
  const totalValueOfSupply = taxableBase + ssclAmount;
  const vatAmount = (totalValueOfSupply * input.vatRate) / 100;
  const grandTotal = totalValueOfSupply + vatAmount;

  return { netAmount, creditTotal, taxableBase, ssclAmount, totalValueOfSupply, vatAmount, grandTotal };
}

export function buildTaxInvoiceHtml(input: TaxInvoiceDocumentInput, autoPrint = false): string {
  const {
    billingClient,
    supplier,
    monthLabel,
    taxInvoiceNo,
    invoiceDate,
    vatRate,
    ssclRate,
    rankLines,
    patrols,
    deductions,
    creditNotes,
    rolloverDebt,
    rolloverFromMonth,
    dueDate,
    companyLogoUrl,
    copyLabel = 'CUSTOMER COPY',
  } = input;

  const trading = supplier.tradingName || 'Classic Venture Security (Pvt) Ltd';
  const totals = computeTotals({
    rankLines,
    patrols,
    deductions,
    creditNotes,
    rolloverDebt,
    vatRate,
    ssclRate,
  });

  const mainDesc = serviceDescription(billingClient, monthLabel);
  const lineRows: string[] = [];

  rankLines.forEach((line, idx) => {
    const qty = line.headcount * line.shiftsPerHead;
    const amount = qty * line.ratePerShift;
    const desc =
      idx === 0
        ? line.eventLabel
          ? `${mainDesc} (${line.eventLabel})`
          : mainDesc
        : line.eventLabel
          ? line.eventLabel
          : '';
    lineRows.push(`<tr>
      <td class="desc">${idx === 0 || desc ? esc(desc) : '&nbsp;'}</td>
      <td class="c">${esc(line.rank)}</td>
      <td class="c">${line.headcount}</td>
      <td class="c">${qty}</td>
      <td class="r">${money(line.ratePerShift)}</td>
      <td class="r b">${money(amount)}</td>
    </tr>`);
  });

  for (const p of patrols) {
    lineRows.push(`<tr>
      <td class="desc">${esc(`Executive Patrol · ${p.visitId} · ${p.date} · ${p.sm}`)}</td>
      <td class="c">—</td>
      <td class="c">1</td>
      <td class="c">1</td>
      <td class="r">${money(p.charge)}</td>
      <td class="r b">${money(p.charge)}</td>
    </tr>`);
  }

  if (rolloverDebt > 0) {
    lineRows.push(`<tr>
      <td class="desc">${esc(`Previous balance rollover${rolloverFromMonth ? ` (${rolloverFromMonth})` : ''}`)}</td>
      <td class="c">—</td>
      <td class="c">1</td>
      <td class="c">1</td>
      <td class="r">${money(rolloverDebt)}</td>
      <td class="r b">${money(rolloverDebt)}</td>
    </tr>`);
  }

  for (const d of deductions) {
    lineRows.push(`<tr>
      <td class="desc">${esc(`Deduction · ${d.incidentRef}`)}</td>
      <td class="c">—</td>
      <td class="c">1</td>
      <td class="c">1</td>
      <td class="r">-${money(d.deductionThisMonth)}</td>
      <td class="r b" style="color:#be123c">-${money(d.deductionThisMonth)}</td>
    </tr>`);
  }

  const creditRows = creditNotes
    .map(
      (cn) => `<tr>
      <td colspan="5" class="desc" style="text-align:right;color:#4338ca">${esc(cn.id)} · ${esc(cn.reason)}</td>
      <td class="r b" style="color:#4338ca">-${money(cn.amount)}</td>
    </tr>`,
    )
    .join('');

  const logoHtml = companyLogoUrl
    ? `<img src="${esc(cacheBustLogoUrl(companyLogoUrl))}" alt="${esc(trading)}" class="logo-img" />`
    : `<div class="logo-fallback">CV</div>`;

  const purchaserPhone = billingClient.invoiceContactPhone?.trim() || '—';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=${INVOICE_A4_WIDTH_PX}"/>
<title>Tax Invoice ${esc(taxInvoiceNo)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    font-size: 11px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: ${INVOICE_A4_WIDTH_PX}px;
    max-width: ${INVOICE_A4_WIDTH_PX}px;
    min-height: 0;
    margin: 0 auto;
    border: 2px solid #000;
    padding: 45px 53px 53px;
    background: #fff;
  }
  .hdr { display: table; width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 8px; }
  .hdr-brand { display: table-cell; vertical-align: middle; width: 58%; }
  .hdr-brand-inner { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .co-meta { display: table-cell; vertical-align: top; text-align: right; font-size: 10px; line-height: 1.5; font-family: Arial, Helvetica, sans-serif; width: 42%; }
  .logo-img { max-height: 113px; width: auto; max-width: 128px; object-fit: contain; display: block; flex-shrink: 0; }
  .logo-fallback {
    height: 113px; width: 113px; flex-shrink: 0; border: 2px solid #000; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: 'University Roman', 'URW University Roman', serif; font-weight: 400; font-size: 16px;
  }
  .co-name {
    font-family: 'University Roman', 'URW University Roman', 'University Roman Std', serif;
    font-size: 22px;
    font-weight: 400;
    font-style: normal;
    text-align: left;
    margin: 0;
    letter-spacing: 0.02em;
    line-height: 1.2;
  }
  .co-meta strong { font-weight: 700; }
  .tax-title-wrap { text-align: center; margin: 10px 0 8px; position: relative; }
  .tax-title { display: inline-block; border: 2px solid #000; padding: 4px 28px; font-size: 14px; font-weight: 800; letter-spacing: 0.12em; }
  .copy-badge { position: absolute; right: 0; top: 0; border: 1px solid #000; padding: 3px 8px; font-size: 9px; font-weight: 700; }
  .pair { display: table; width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 8px 0; margin-bottom: 8px; }
  .field-box { display: table-cell; width: 50%; vertical-align: top; border: 1px solid #000; padding: 6px 8px; min-height: 32px; }
  .field-box .lbl { font-weight: 700; }
  .tin-pair { display: table; width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 8px 0; margin-bottom: 10px; }
  .tin-box { display: table-cell; width: 50%; vertical-align: top; border: 1px solid #000; padding: 8px; min-height: 88px; font-size: 10px; }
  .tin-box p { margin: 2px 0; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th { background: #1a1a1a; color: #fff; font-size: 9px; padding: 6px 4px; border: 1px solid #000; text-transform: uppercase; }
  table.items td { border: 1px solid #000; padding: 5px 4px; vertical-align: top; }
  td.c { text-align: center; }
  td.r { text-align: right; font-variant-numeric: tabular-nums; }
  td.b { font-weight: 700; }
  td.desc { font-size: 10px; }
  .summary td { border: 1px solid #000; padding: 5px 8px; }
  .summary .lbl { text-align: left; font-weight: 700; }
  .summary .val { text-align: right; font-weight: 700; width: 140px; }
  .summary .net td { background: #f5f5f5; }
  .words { border: 1px solid #000; padding: 8px; margin-top: 8px; min-height: 36px; }
  .pay { margin-top: 10px; font-size: 10px; font-style: italic; }
  .sig { margin-top: 28px; border-top: 1px dotted #000; width: 220px; padding-top: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
  @media print {
    body { padding: 0; }
    .page { border: 2px solid #000; width: 100%; max-width: 100%; min-height: auto; margin: 0; padding: 12mm 14mm 14mm; }
  }
  @media screen {
    body { margin: 0; padding: 0; background: #e8e8e8; }
    .page { min-height: ${INVOICE_A4_HEIGHT_PX}px; margin: 0; }
  }
</style></head><body>
<div class="page">
  <div class="hdr">
    <div class="hdr-brand">
      <div class="hdr-brand-inner">
        ${logoHtml}
        <h1 class="co-name">${esc(trading)}</h1>
      </div>
    </div>
    <div class="co-meta">
      <div><strong>Head Office :</strong> ${esc(supplier.headOffice)}</div>
      <div><strong>Telephone :</strong> ${esc(supplier.telephone)}</div>
      <div><strong>E-mail :</strong> ${esc(supplier.email)}</div>
      <div><strong>PV No. :</strong> ${esc(supplier.pvNumber)}</div>
    </div>
  </div>

  <div class="tax-title-wrap">
    <span class="tax-title">Tax Invoice</span>
    <span class="copy-badge">${esc(copyLabel)}</span>
  </div>

  <div class="pair">
    <div class="field-box"><span class="lbl">Date of Invoice :</span> ${esc(invoiceDate)}</div>
    <div class="field-box"><span class="lbl">Tax Invoice No :</span> ${esc(taxInvoiceNo)}</div>
  </div>
  ${
    dueDate
      ? `<div class="pair"><div class="field-box"><span class="lbl">Payment Due Date :</span> ${esc(formatInvoiceDueDateLabel(dueDate))}</div><div class="field-box"></div></div>`
      : ''
  }

  <div class="tin-pair">
    <div class="tin-box">
      <p><strong>Supplier&rsquo;s TIN</strong> - ${esc(supplier.supplierTin)}</p>
      <p><strong>${esc(trading)}</strong></p>
      <p>${esc(supplier.supplierAddress)}</p>
      <p>Telephone No - ${esc(supplier.telephone)}</p>
    </div>
    <div class="tin-box">
      <p><strong>Purchaser&rsquo;s TIN</strong> - ${esc(billingClient.purchaserTin || '—')}</p>
      <p><strong>${esc(billingClient.clientName)}</strong></p>
      <p>${esc(billingClient.address || billingClient.sector || '—')}</p>
      <p>Telephone No - ${esc(purchaserPhone)}</p>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Description of Service</th>
        <th style="width:48px">Rank</th>
        <th style="width:36px">No</th>
        <th style="width:44px">Qty.</th>
        <th style="width:80px">Rate</th>
        <th style="width:96px">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows.join('') || '<tr><td colspan="6" style="text-align:center">No billable lines</td></tr>'}
      ${creditRows}
      <tr class="net">
        <td colspan="5" class="lbl" style="text-align:right;font-weight:800;border:1px solid #000">NET AMOUNT</td>
        <td class="r b" style="border:1px solid #000">${money(totals.netAmount - totals.creditTotal)}</td>
      </tr>
      <tr>
        <td colspan="5" style="text-align:right;font-weight:700;border:1px solid #000">SSCL (Rate: ${ssclRate}%)</td>
        <td class="r b" style="border:1px solid #000">${money(totals.ssclAmount)}</td>
      </tr>
    </tbody>
  </table>

  <table class="summary" style="width:100%;border-collapse:collapse;margin-top:0">
    <tr>
      <td class="lbl" style="border:1px solid #000">Total Value of Supply : LKR</td>
      <td class="val" style="border:1px solid #000">${money(totals.totalValueOfSupply)}</td>
    </tr>
    <tr>
      <td class="lbl" style="border:1px solid #000">VAT Amount (Total Value of Supply @ (${vatRate}%)) : LKR</td>
      <td class="val" style="border:1px solid #000">${money(totals.vatAmount)}</td>
    </tr>
    <tr>
      <td class="lbl" style="border:1px solid #000;font-size:12px">Total Amount including VAT : LKR</td>
      <td class="val" style="border:1px solid #000;font-size:12px">${money(totals.grandTotal)}</td>
    </tr>
  </table>

  <div class="words">
    <strong>Total Amount in words :</strong> ${esc(lkrAmountInWords(totals.grandTotal))}
  </div>

  <p class="pay">* Cheques should be drawn in favour of &lsquo;${esc(trading)}.&rsquo;</p>

  <div class="sig">Authorized Officer&rsquo;s Signature</div>
</div>
${autoPrint ? '<script>window.onload=function(){window.print();}</script>' : ''}
</body></html>`;
}

export async function openTaxInvoiceDocument(
  html: string,
  mode: 'print' | 'download',
  filename: string,
  /** Pass a window opened synchronously on click to avoid popup blockers. */
  preOpenedWindow?: Window | null,
): Promise<void> {
  if (mode === 'download') {
    const { downloadTaxInvoicePdf } = await import('./invoice-pdf-download');
    await downloadTaxInvoicePdf(html, filename);
    return;
  }
  const w = preOpenedWindow ?? window.open('', '_blank', 'width=794,height=1123');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }
}

export function defaultInvoiceDateLabel(): string {
  return formatInvoicePrintDate(new Date());
}
