import { downloadFmA4Pdf, openFmA4Report } from './fm-report-print';
import type { FmPayrollRosterRow } from './fm-payroll-roster-data';
import { workforceGroupLabel } from './fm-payroll-roster-data';

function lkr(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  return `${sign}LKR ${abs.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BULK_PAYSLIP_PRINT_CSS = `
  .payslip-sheet { page-break-after: always; margin-bottom: 28px; }
  .payslip-sheet:last-child { page-break-after: auto; margin-bottom: 0; }
  .payslip-sheet-hdr { border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 12px; }
  .payslip-sheet-hdr h2 { font-size: 14px; font-weight: 900; }
  .payslip-sheet-hdr p { font-size: 10px; color: #64748b; margin-top: 4px; }
`;

export function buildPayslipTableHtml(row: FmPayrollRosterRow, periodLabel: string) {
  const rows = [
    ['Employee', `${row.name} (${row.empNumber})`],
    ['EPF No', row.epfNo],
    ['Rank', row.rank],
    ['Workforce', workforceGroupLabel(row.workforceGroup)],
    ['Sector', row.sector],
    ['Primary site', row.site],
    ['Pay period', periodLabel],
    ['Salary / basic (MNR or rank)', lkr(row.salaryLkr)],
    ['Total earnings (gross)', lkr(row.earningsLkr)],
    ['Total deductions', row.deductionsLkr > 0 ? `− ${lkr(row.deductionsLkr)}` : '—'],
    ['Net take-home', lkr(row.netPayLkr)],
    ['Payslip reference', row.payslipId],
  ];

  return rows
    .map(
      ([label, value]) =>
        `<tr><td style="font-weight:600;width:42%;">${escapeHtml(label)}</td><td class="num">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
}

export function buildBulkPayslipsContentHtml(
  rows: FmPayrollRosterRow[],
  periodLabel: string,
) {
  return rows
    .map(
      (row) => `
    <section class="payslip-sheet">
      <div class="payslip-sheet-hdr">
        <h2>${escapeHtml(row.name)}</h2>
        <p>${escapeHtml(row.empNumber)} · ${escapeHtml(workforceGroupLabel(row.workforceGroup))} · ${escapeHtml(row.payslipId)}</p>
      </div>
      <table>
        <thead><tr><th>Field</th><th style="text-align:right">Amount / detail</th></tr></thead>
        <tbody>${buildPayslipTableHtml(row, periodLabel)}</tbody>
      </table>
    </section>`,
    )
    .join('');
}

function bulkPayslipFilenameSlug(selectionLabel: string, periodLabel: string) {
  const period = periodLabel.replace(/\s+/g, '-');
  const group = selectionLabel.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `payslips-bulk-${group || 'selection'}-${period}`;
}

export function openBulkPayslipPrint(
  rows: FmPayrollRosterRow[],
  periodLabel: string,
  selectionLabel: string,
) {
  if (rows.length === 0) return;
  openFmA4Report({
    title: 'Employee Payslips',
    subtitle: `${selectionLabel} · ${rows.length} employee${rows.length === 1 ? '' : 's'}`,
    period: periodLabel,
    tableHeadHtml: '',
    tableBodyHtml: '',
    contentHtml: buildBulkPayslipsContentHtml(rows, periodLabel),
    extraCss: BULK_PAYSLIP_PRINT_CSS,
    footerNote:
      'Bulk draft payslips for the current roster selection. Official copies after batch payroll generation and MD approval.',
    autoPrint: true,
  });
}

export async function downloadBulkPayslipPdf(
  rows: FmPayrollRosterRow[],
  periodLabel: string,
  selectionLabel: string,
) {
  if (rows.length === 0) return;
  await downloadFmA4Pdf({
    filename: bulkPayslipFilenameSlug(selectionLabel, periodLabel),
    title: 'Employee Payslips',
    subtitle: `${selectionLabel} · ${rows.length} employee${rows.length === 1 ? '' : 's'}`,
    period: periodLabel,
    tableHeadHtml: '',
    tableBodyHtml: '',
    contentHtml: buildBulkPayslipsContentHtml(rows, periodLabel),
  });
}

export function openPayslipPrint(row: FmPayrollRosterRow, periodLabel: string) {
  openFmA4Report({
    title: 'Employee Payslip',
    subtitle: `${row.name} · ${row.empNumber}`,
    period: periodLabel,
    tableHeadHtml:
      '<tr><th>Field</th><th style="text-align:right">Amount / detail</th></tr>',
    tableBodyHtml: buildPayslipTableHtml(row, periodLabel),
    footerNote: `Draft payslip ${row.payslipId}. Official copy after batch payroll generation and MD approval.`,
    autoPrint: true,
  });
}

export async function downloadPayslipPdf(
  row: FmPayrollRosterRow,
  periodLabel: string,
) {
  const safeName = row.empNumber.replace(/[^A-Z0-9-]/gi, '_');
  await downloadFmA4Pdf({
    filename: `payslip-${safeName}-${periodLabel.replace(/\s+/g, '-')}`,
    title: 'Employee Payslip',
    subtitle: `${row.name} · ${row.empNumber}`,
    period: periodLabel,
    tableHeadHtml:
      '<tr><th>Field</th><th style="text-align:right">Amount / detail</th></tr>',
    tableBodyHtml: buildPayslipTableHtml(row, periodLabel),
  });
}

export function payslipPreviewSections(row: FmPayrollRosterRow, periodLabel: string) {
  return [
    { label: 'Pay period', value: periodLabel },
    { label: 'EPF No', value: row.epfNo, mono: true },
    { label: 'Rank', value: row.rank },
    { label: 'Sector', value: row.sector },
    { label: 'Site', value: row.site },
    { label: 'Workforce', value: workforceGroupLabel(row.workforceGroup) },
    { label: 'Salary / basic', value: lkr(row.salaryLkr), highlight: false },
    { label: 'Earnings (gross)', value: lkr(row.earningsLkr), highlight: true },
    { label: 'Deductions', value: row.deductionsLkr > 0 ? `− ${lkr(row.deductionsLkr)}` : '—', danger: true },
    { label: 'Net take-home', value: lkr(row.netPayLkr), success: true },
    { label: 'Reference', value: row.payslipId, mono: true },
  ];
}
