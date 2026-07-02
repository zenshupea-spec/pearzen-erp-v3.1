import { LOGO_STORAGE_KEY } from '../../../../../packages/supabase/branding-constants';
import { DEFAULT_SUPPLIER_PROFILE } from '../../../lib/invoice-desk/types';
import type { FmPayrollRosterRow, FmShiftTypeLine } from './fm-payroll-roster-data';
import {
  fixedSalaryCalendarShiftLines,
  inferPayslipEmployeeKind,
  payslipPeriodTitle,
  resolveGuardPayslipEarnings,
  resolvePayslipStatutory,
  resolveSmPayslipEarnings,
} from './fm-payslip-layout';
import type { SmPayMode } from './sm-pay-settings';

export type FmPayslipPrintOptions = {
  logoDataUrl?: string;
  companyName?: string;
  companyAddress?: string;
  pvNumber?: string;
  bankName?: string;
  bankAccountNo?: string;
};

type PayslipAmountRow = {
  label: string;
  amountLkr: number;
  muted?: boolean;
};

type ClassicPayslipModel = {
  periodTitle: string;
  companyName: string;
  companyAddress: string;
  pvNumber: string;
  logoDataUrl: string;
  empNumber: string;
  epfNo: string;
  rank: string;
  name: string;
  site: string;
  totalShifts: number;
  daysWorked: number;
  earningsTop: PayslipAmountRow[];
  adjustedBasicTotalLkr: number;
  shiftTypeLines: FmShiftTypeLine[];
  basicShiftPaidTotalLkr: number;
  allowanceRows: PayslipAmountRow[];
  totalEarningsLkr: number;
  deductionRows: PayslipAmountRow[];
  totalDeductionsLkr: number;
  netPayLkr: number;
  bankName: string;
  bankAccountNo: string;
  epfEmployeeLkr: number;
  epfEmployerLkr: number;
  etfEmployerLkr: number;
  totalStatutoryLkr: number;
};

const CLASSIC_COMPANY_NAME = 'CLASSIC VENTURE SECURITY (PVT) LTD.';
const CLASSIC_COMPANY_ADDRESS = DEFAULT_SUPPLIER_PROFILE.headOffice;
const CLASSIC_PV_NUMBER = `PV-${DEFAULT_SUPPLIER_PROFILE.pvNumber}`;

const PAYSLIP_SINHALA_NOTICE =
  'මෙම වැටුප් පත්‍රිකාව කම්පනයේ නිල වාර්තා පද්ධතියෙන් නිකුත් කරන ලද්දකි. ' +
  'අසත්‍ය හෝ අවිනිශ්චිත තොරතුරු දැනුම් දෙන්න. ඒකාබද්ධ නිල ඇඳුම් සඳහා Rs. 1,000/- සහ ' +
  'පුහුණුව සඳහා Rs. 500/- යන මුදල් අදාළ නීති රීති අනුව අඩු කරනු ලැබේ.';

const SHIFT_TYPE_LABELS = [
  'Basic shift pay',
  'Saturday',
  'Sunday',
  'Poyaday',
  'Public Holiday',
] as const;

const DAY_TYPE_TO_LABEL: Record<string, (typeof SHIFT_TYPE_LABELS)[number]> = {
  'Normal Days': 'Basic shift pay',
  Saturdays: 'Saturday',
  Sundays: 'Sunday',
  'Poya Days': 'Poyaday',
  'Public Holidays': 'Public Holiday',
};

/** 96 dpi — matches browser/CSS inch units for html2canvas PDF capture. */
const PAYSLIP_PAGE_W_PX = Math.round(5.5 * 96);
const PAYSLIP_PAGE_H_PX = Math.round(11 * 96);

const CLASSIC_PAYSLIP_PRINT_CSS = `
  @page { size: 5.5in 11in; margin: 0.14in 0.1in; }
  @media print {
    html, body { width: 5.5in; min-height: 11in; padding: 0 !important; margin: 0 !important; }
    .payslip-page { box-shadow: none !important; border: none !important; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 8.5pt;
    line-height: 1.2;
    color: #000;
    background: #fff;
    padding: 8px;
  }
  body.pdf-capture {
    padding: 0;
    margin: 0;
    width: ${PAYSLIP_PAGE_W_PX}px;
    overflow: hidden;
  }
  .payslip-page {
    width: 5.3in;
    min-height: 10.7in;
    margin: 0 auto;
    border: 1px solid #bbb;
    padding: 10px 10px 12px;
  }
  body.pdf-capture .payslip-page {
    width: ${PAYSLIP_PAGE_W_PX}px;
    min-height: ${PAYSLIP_PAGE_H_PX}px;
    margin: 0;
    border: none;
    padding: 14px 16px 16px;
  }
  .payslip-page + .payslip-page { page-break-before: always; margin-top: 0; }
  .layout-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .layout-table td { vertical-align: top; padding: 0; }
  .hdr-logo { width: 24%; padding-right: 4px !important; }
  .hdr-company { width: 71%; text-align: center; }
  .hdr-copy { width: 5%; text-align: right; font-size: 10pt; font-weight: 700; }
  .logo-wrap img {
    width: 0.72in;
    height: 0.72in;
    object-fit: contain;
    display: block;
  }
  .logo-fallback {
    width: 0.72in;
    height: 0.72in;
    border: 1px solid #999;
    border-radius: 50%;
    font-size: 7pt;
    font-weight: 700;
    text-align: center;
    line-height: 1.05;
    padding-top: 0.18in;
  }
  .emp-tag {
    margin-top: 3px;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .company-block h1 {
    font-size: 9.5pt;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .company-block p { font-size: 8pt; margin-top: 2px; }
  .title {
    text-align: center;
    font-size: 9pt;
    font-weight: 700;
    text-decoration: underline;
    margin: 4px 0 8px;
    letter-spacing: 0.04em;
  }
  .emp-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; table-layout: fixed; }
  .emp-table td { padding: 1px 0; vertical-align: top; }
  .emp-table .lbl { font-weight: 700; }
  .rule { border: none; border-top: 1px solid #000; margin: 5px 0; }
  .section-hd { width: 100%; border-collapse: collapse; font-weight: 700; font-size: 8.5pt; margin-bottom: 3px; table-layout: fixed; }
  .section-hd td { padding: 0; }
  .section-hd .amt-hd { text-align: right; width: 28%; }
  .amount-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; table-layout: fixed; }
  .amount-table col.amt-col { width: 28%; }
  .amount-table td { padding: 1px 0; vertical-align: top; }
  .amount-table td.amt {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .amount-table tr.total td {
    font-weight: 700;
    border-top: 1px solid #000;
    padding-top: 2px;
  }
  .amount-table tr.subtotal td { font-weight: 700; }
  .shift-box {
    border: 1px solid #000;
    margin: 4px 0 5px;
    padding: 4px 5px;
  }
  .shift-box-hd { width: 100%; border-collapse: collapse; table-layout: fixed; font-weight: 700; font-size: 8pt; margin-bottom: 3px; }
  .shift-box-hd td { padding: 0 0 2px; border-bottom: 1px solid #000; vertical-align: bottom; }
  .shift-hd-label { width: 46%; text-align: left; }
  .shift-hd-mid { width: 30%; text-align: center; }
  .shift-hd-amt { width: 24%; text-align: right; font-variant-numeric: tabular-nums; }
  .shift-type-table { width: 100%; border-collapse: collapse; font-size: 8pt; table-layout: fixed; }
  .shift-type-table col.type-col { width: 52%; }
  .shift-type-table col.count-col { width: 20%; }
  .shift-type-table col.amt-col { width: 28%; }
  .shift-type-table th,
  .shift-type-table td { padding: 1px 2px; text-align: left; vertical-align: top; }
  .shift-type-table th.count,
  .shift-type-table td.count,
  .shift-type-table th.amt,
  .shift-type-table td.amt { text-align: right; font-variant-numeric: tabular-nums; }
  .shift-type-table th { font-weight: 700; font-size: 7.5pt; }
  .net-line { width: 100%; border-collapse: collapse; font-weight: 700; font-size: 9pt; margin: 5px 0 2px; table-layout: fixed; }
  .net-line td { text-decoration: underline; padding: 0; }
  .net-line td.amt { text-align: right; width: 28%; font-variant-numeric: tabular-nums; }
  .bank-line { font-size: 8pt; margin-bottom: 4px; }
  .statutory .amount-table tr.total td { border-top: 1px solid #000; }
  .sinhala {
    margin-top: 8px;
    font-size: 7.5pt;
    line-height: 1.35;
    text-align: justify;
  }
`;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lkr(n: number) {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (n < 0) return `(${formatted})`;
  return formatted;
}

function lkrDisplay(n: number) {
  return `LKR ${lkr(n)}`;
}

function shiftsDisplay(n: number) {
  return n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function deductionAmountByType(
  row: FmPayrollRosterRow,
  type: 'Meals' | 'Uniform' | 'Penalty' | 'Advance',
): number {
  return row.deductionLines?.find((line) => line.type === type)?.amountLkr ?? 0;
}

function normalizeShiftTypeLines(row: FmPayrollRosterRow): FmShiftTypeLine[] {
  const fromRow = row.shiftTypeLines ?? [];
  const byLabel = new Map(fromRow.map((line) => [line.label, line]));

  return SHIFT_TYPE_LABELS.map((label) => {
    const existing = byLabel.get(label);
    if (existing) return existing;

    const sourceKey = Object.entries(DAY_TYPE_TO_LABEL).find(([, mapped]) => mapped === label)?.[0];
    const fromDayType = fromRow.find((line) => line.label === sourceKey);
    if (fromDayType) {
      return {
        label,
        shifts: fromDayType.shifts,
        amountLkr: fromDayType.amountLkr,
      };
    }

    if (label === 'Basic shift pay') {
      const shifts = row.totalShifts ?? 0;
      const amount = row.basicShiftPaidLkr ?? (shifts > 0 ? row.earningsLkr : 0);
      return { label, shifts, amountLkr: amount };
    }

    return { label, shifts: 0, amountLkr: 0 };
  });
}

function periodTitleFromLabel(periodLabel: string) {
  return payslipPeriodTitle(periodLabel);
}

function resolveClassicPayslipModel(
  row: FmPayrollRosterRow,
  periodLabel: string,
  opts: FmPayslipPrintOptions = {},
): ClassicPayslipModel {
  const employeeKind = inferPayslipEmployeeKind(row);
  const isFixedSalaryStaff = employeeKind === 'ho_fixed' || employeeKind === 'sm';
  const statutory = resolvePayslipStatutory(row);

  let basicSalaryLkr = row.salaryLkr;
  let siteAllowanceLkr =
    row.siteAllowanceLkr ?? Math.max(0, row.earningsLkr - (row.basicShiftPaidLkr ?? 0));
  let totalEarningsLkr = row.earningsLkr;
  let adjustedBasicTotalLkr = row.adjustedBasicTotalLkr ?? basicSalaryLkr;

  if (employeeKind === 'sm' && row.smPayMode) {
    const smSplit = resolveSmPayslipEarnings(row, row.smPayMode as SmPayMode);
    basicSalaryLkr = smSplit.basicSalaryLkr;
    siteAllowanceLkr = smSplit.siteAllowanceLkr;
    totalEarningsLkr = smSplit.totalEarningsLkr;
    adjustedBasicTotalLkr = smSplit.basicSalaryLkr;
  } else if (employeeKind === 'guard') {
    siteAllowanceLkr = resolveGuardPayslipEarnings(row).siteAllowanceLkr;
  }

  const noPayRecoveryDays = row.noPayRecoveryDays ?? 0;
  const noPayRecoveryLkr = row.noPayRecoveryLkr ?? 0;
  if (!isFixedSalaryStaff) {
    const bra1Lkr = row.bra1Lkr ?? 0;
    const bra2Lkr = row.bra2Lkr ?? 0;
    adjustedBasicTotalLkr =
      row.adjustedBasicTotalLkr ?? basicSalaryLkr + bra1Lkr + bra2Lkr + noPayRecoveryLkr;
  } else {
    adjustedBasicTotalLkr = basicSalaryLkr + noPayRecoveryLkr;
  }

  let shiftTypeLines: FmShiftTypeLine[];
  let basicShiftPaidTotalLkr: number;
  let totalShifts: number;
  let daysWorked: number;

  if (isFixedSalaryStaff) {
    shiftTypeLines = fixedSalaryCalendarShiftLines(periodLabel);
    basicShiftPaidTotalLkr = 0;
    totalShifts = shiftTypeLines.reduce((sum, line) => sum + line.shifts, 0);
    daysWorked = shiftTypeLines.find((line) => line.label === 'Basic shift pay')?.shifts ?? 0;
  } else if (employeeKind === 'guard') {
    const guardSplit = resolveGuardPayslipEarnings(row);
    shiftTypeLines = normalizeShiftTypeLines({
      ...row,
      shiftTypeLines:
        guardSplit.shiftTypeLines.length > 0 ? guardSplit.shiftTypeLines : row.shiftTypeLines,
    });
    basicShiftPaidTotalLkr = guardSplit.basicShiftPaidTotalLkr;
    totalShifts = guardSplit.totalShifts;
    daysWorked = guardSplit.daysWorked;
  } else {
    shiftTypeLines = normalizeShiftTypeLines(row);
    basicShiftPaidTotalLkr =
      row.basicShiftPaidLkr ?? shiftTypeLines.reduce((sum, line) => sum + line.amountLkr, 0);
    totalShifts = row.totalShifts ?? shiftTypeLines.reduce((sum, line) => sum + line.shifts, 0);
    daysWorked = row.daysWorked ?? totalShifts;
  }
  const fixedAllowanceLkr = row.fixedAllowanceLkr ?? 0;
  const specialAllowanceLkr = row.specialAllowanceLkr ?? 0;
  const attendanceAllowanceLkr = row.attendanceAllowanceLkr ?? 0;
  const mealAllowanceLkr = row.mealAllowanceLkr ?? 0;
  const transportAllowanceLkr = row.transportAllowanceLkr ?? 0;
  const extraOtLkr = row.extraOtLkr ?? 0;
  const arrearsLkr = row.arrearsLkr ?? 0;
  const performanceIncentiveLkr = row.performanceIncentiveLkr ?? 0;

  const allowanceRows: PayslipAmountRow[] = [
    { label: 'Fixed Allowance', amountLkr: fixedAllowanceLkr, muted: fixedAllowanceLkr === 0 },
    { label: 'Special Allowance', amountLkr: specialAllowanceLkr, muted: specialAllowanceLkr === 0 },
    {
      label: 'Site Allowance',
      amountLkr: siteAllowanceLkr,
      muted: employeeKind !== 'sm' && employeeKind !== 'guard' && siteAllowanceLkr === 0,
    },
    { label: 'Attendance Allowance', amountLkr: attendanceAllowanceLkr },
    { label: 'Meal Allowance', amountLkr: mealAllowanceLkr },
    { label: 'Transport Allowance', amountLkr: transportAllowanceLkr },
    { label: 'Extra OT', amountLkr: extraOtLkr },
    { label: 'Arrears', amountLkr: arrearsLkr },
    { label: 'Performance incentive', amountLkr: performanceIncentiveLkr },
  ];

  if (employeeKind === 'sm') {
    totalEarningsLkr =
      adjustedBasicTotalLkr +
      allowanceRows.reduce((sum, item) => sum + item.amountLkr, 0);
  } else if (totalEarningsLkr <= 0) {
    totalEarningsLkr =
      adjustedBasicTotalLkr +
      basicShiftPaidTotalLkr +
      allowanceRows.reduce((sum, item) => sum + item.amountLkr, 0);
  }

  const salaryAdvanceLkr = row.advanceDeductionLkr || deductionAmountByType(row, 'Advance');
  const mealsLkr = row.mealsDeductionLkr ?? deductionAmountByType(row, 'Meals');
  const uniformsLkr = row.uniformsDeductionLkr ?? deductionAmountByType(row, 'Uniform');
  const penaltyLkr = row.otherDeductionsLkr ?? deductionAmountByType(row, 'Other Deductions');
  const deathDonationsLkr = row.deathDonationsLkr ?? 0;
  const epfEmployeeLkr = statutory.epfEmployeeLkr;
  const epfEmployerLkr = statutory.epfEmployerLkr;
  const etfEmployerLkr = statutory.etfEmployerLkr;
  const payeeTaxLkr = statutory.payeeTaxLkr;
  const stampDutyLkr = statutory.stampDutyLkr;

  const deductionRows: PayslipAmountRow[] = [
    { label: 'Salary Advance', amountLkr: salaryAdvanceLkr },
    { label: 'Meals', amountLkr: mealsLkr },
    { label: 'Accomodation', amountLkr: row.accommodationDeductionLkr ?? 0 },
    { label: 'Death Donations', amountLkr: deathDonationsLkr },
    { label: 'Wedding Gifts', amountLkr: row.weddingGiftsDeductionLkr ?? 0 },
    { label: 'Extra Items', amountLkr: row.extraItemsDeductionLkr ?? 0 },
    { label: 'Unit Damages', amountLkr: row.unitDamagesDeductionLkr ?? 0 },
    { label: 'Training', amountLkr: row.trainingDeductionLkr ?? 0 },
    { label: 'Salary Loan', amountLkr: row.salaryLoanDeductionLkr ?? 0 },
    { label: 'Uniforms', amountLkr: uniformsLkr },
    { label: 'Other Deductions', amountLkr: penaltyLkr },
    { label: 'APIT (PAYE)', amountLkr: payeeTaxLkr },
    { label: 'Stamp Duty', amountLkr: stampDutyLkr },
    { label: 'E.P.F.', amountLkr: epfEmployeeLkr },
  ];

  const computedDeductions = deductionRows.reduce((sum, item) => sum + item.amountLkr, 0);
  const totalDeductionsLkr =
    row.deductionsLkr > 0 ? row.deductionsLkr : computedDeductions;
  const netPayLkr = row.netPayLkr > 0 ? row.netPayLkr : Math.max(0, totalEarningsLkr - totalDeductionsLkr);

  const earningsTop: PayslipAmountRow[] = [
    { label: 'Basic Salary', amountLkr: basicSalaryLkr },
    {
      label: `No Pay Recovery Days ${noPayRecoveryDays}`,
      amountLkr: noPayRecoveryLkr,
      muted: noPayRecoveryDays === 0,
    },
  ];

  return {
    periodTitle: periodTitleFromLabel(periodLabel),
    companyName: opts.companyName ?? CLASSIC_COMPANY_NAME,
    companyAddress: opts.companyAddress ?? CLASSIC_COMPANY_ADDRESS,
    pvNumber: opts.pvNumber ?? CLASSIC_PV_NUMBER,
    logoDataUrl: opts.logoDataUrl ?? '',
    empNumber: row.empNumber,
    epfNo: row.epfNo,
    rank: row.rank,
    name: row.name,
    site: row.site,
    totalShifts,
    daysWorked,
    earningsTop,
    adjustedBasicTotalLkr,
    shiftTypeLines,
    basicShiftPaidTotalLkr,
    allowanceRows,
    totalEarningsLkr,
    deductionRows,
    totalDeductionsLkr,
    netPayLkr,
    bankName: opts.bankName ?? row.bankName ?? '—',
    bankAccountNo: opts.bankAccountNo ?? row.bankAccountNo ?? '—',
    epfEmployeeLkr,
    epfEmployerLkr,
    etfEmployerLkr,
    totalStatutoryLkr: epfEmployeeLkr + epfEmployerLkr + etfEmployerLkr,
  };
}

function amountTableColsHtml() {
  return '<colgroup><col /><col class="amt-col" /></colgroup>';
}

function buildAmountRowsHtml(rows: PayslipAmountRow[]) {
  return rows
    .map(
      (row) =>
        `<tr${row.muted ? ' style="color:#444;"' : ''}><td>${escapeHtml(row.label)}</td><td class="amt">${lkr(row.amountLkr)}</td></tr>`,
    )
    .join('');
}

function buildClassicPayslipPageHtml(model: ClassicPayslipModel) {
  const logoHtml = model.logoDataUrl
    ? `<img src="${model.logoDataUrl}" alt="Company logo" />`
    : `<div class="logo-fallback">Classic<br/>Venture</div>`;

  const shiftTypeRows = model.shiftTypeLines
    .map(
      (line) =>
        `<tr>
          <td>${escapeHtml(line.label)}</td>
          <td class="count">${shiftsDisplay(line.shifts)}</td>
          <td class="amt">${lkr(line.amountLkr)}</td>
        </tr>`,
    )
    .join('');

  return `
  <section class="payslip-page">
    <table class="layout-table hdr-table">
      <tr>
        <td class="hdr-logo">
          <div class="logo-wrap">
            ${logoHtml}
            <div class="emp-tag">${escapeHtml(model.empNumber)}</div>
          </div>
        </td>
        <td class="hdr-company">
          <div class="company-block">
            <h1>${escapeHtml(model.companyName)}</h1>
            <p>${escapeHtml(model.companyAddress)}</p>
          </div>
        </td>
        <td class="hdr-copy">E</td>
      </tr>
    </table>

    <div class="title">${escapeHtml(model.periodTitle)}</div>

    <table class="emp-table">
      <tr>
        <td width="50%"><span class="lbl">EPF NO. :</span> ${escapeHtml(model.epfNo)}</td>
        <td width="50%"><span class="lbl">RANK :</span> ${escapeHtml(model.rank)}</td>
      </tr>
      <tr>
        <td colspan="2"><span class="lbl">NAME :</span> ${escapeHtml(model.name)}</td>
      </tr>
      <tr>
        <td colspan="2"><span class="lbl">SITE :</span> ${escapeHtml(model.site)}</td>
      </tr>
      <tr>
        <td><span class="lbl">TOTAL SHIFTS :</span> ${shiftsDisplay(model.totalShifts)}</td>
        <td><span class="lbl">DAYS :</span> ${shiftsDisplay(model.daysWorked)}</td>
      </tr>
    </table>

    <hr class="rule" />

    <table class="section-hd"><tr><td>EARNINGS</td><td class="amt-hd">AMOUNT</td></tr></table>
    <table class="amount-table">
      ${amountTableColsHtml()}
      <tbody>
        ${buildAmountRowsHtml(model.earningsTop)}
        <tr class="total"><td>TOTAL</td><td class="amt">${lkr(model.adjustedBasicTotalLkr)}</td></tr>
      </tbody>
    </table>

    <div class="shift-box">
      <table class="shift-box-hd">
        <tr>
          <td class="shift-hd-label">Basic Shift Paid</td>
          <td class="shift-hd-mid">Shifts ${shiftsDisplay(model.totalShifts)}</td>
          <td class="shift-hd-amt">${lkr(model.basicShiftPaidTotalLkr)}</td>
        </tr>
      </table>
      <table class="shift-type-table">
        <colgroup>
          <col class="type-col" />
          <col class="count-col" />
          <col class="amt-col" />
        </colgroup>
        <thead>
          <tr><th>Shift type</th><th class="count">Count</th><th class="amt">Amount</th></tr>
        </thead>
        <tbody>${shiftTypeRows}</tbody>
      </table>
    </div>

    <table class="amount-table">
      ${amountTableColsHtml()}
      <tbody>
        ${buildAmountRowsHtml(model.allowanceRows)}
        <tr class="subtotal"><td></td><td class="amt">${lkr(model.totalEarningsLkr)}</td></tr>
      </tbody>
    </table>

    <hr class="rule" />

    <table class="section-hd"><tr><td>DEDUCTIONS</td><td class="amt-hd"></td></tr></table>
    <table class="amount-table">
      ${amountTableColsHtml()}
      <tbody>
        ${buildAmountRowsHtml(model.deductionRows)}
        <tr class="total"><td>Total Deductions</td><td class="amt">${lkr(model.totalDeductionsLkr)}</td></tr>
      </tbody>
    </table>

    <table class="net-line">
      <tr>
        <td>NET SALARY to Bank Account</td>
        <td class="amt">${lkr(model.netPayLkr)}</td>
      </tr>
    </table>
    <p class="bank-line">${escapeHtml(model.bankName)} Ac/No ${escapeHtml(model.bankAccountNo)}</p>

    <hr class="rule" />

    <table class="section-hd statutory"><tr><td>Statutory Payments</td><td class="amt-hd"></td></tr></table>
    <table class="amount-table statutory">
      ${amountTableColsHtml()}
      <tbody>
        <tr><td>EPF - Employee 8%</td><td class="amt">${lkr(model.epfEmployeeLkr)}</td></tr>
        <tr><td>EPF - Employer 12%</td><td class="amt">${lkr(model.epfEmployerLkr)}</td></tr>
        <tr class="subtotal"><td></td><td class="amt">${lkr(model.epfEmployeeLkr + model.epfEmployerLkr)}</td></tr>
        <tr><td>ETF - Employer 3%</td><td class="amt">${lkr(model.etfEmployerLkr)}</td></tr>
        <tr class="total"><td></td><td class="amt">${lkr(model.totalStatutoryLkr)}</td></tr>
      </tbody>
    </table>

    <p class="sinhala">${escapeHtml(PAYSLIP_SINHALA_NOTICE)}</p>
  </section>`;
}

function buildClassicPayslipDocumentHtml(
  pages: ClassicPayslipModel[],
  title: string,
  opts: { autoPrint?: boolean; forPdf?: boolean } = {},
) {
  const { autoPrint = true, forPdf = false } = opts;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>${CLASSIC_PAYSLIP_PRINT_CSS}</style>
</head>
<body class="${forPdf ? 'pdf-capture' : ''}">
  ${pages.map((page) => buildClassicPayslipPageHtml(page)).join('')}
  ${autoPrint ? '<script>window.onload=function(){window.print();}</script>' : ''}
</body>
</html>`;
}

function readLogoFromStorage(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LOGO_STORAGE_KEY) ?? '';
}

async function waitForPayslipImages(doc: Document) {
  const imgs = [...doc.querySelectorAll('img')];
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
          window.setTimeout(() => resolve(), 400);
        }),
    ),
  );
}

function openClassicPayslipWindowFallback(html: string) {
  const htmlWithPrint = html.includes('window.print()')
    ? html
    : html.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>');
  const blob = new Blob([htmlWithPrint], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'width=560,height=980');
  if (w) {
    w.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
    return;
  }
  URL.revokeObjectURL(url);
  window.alert('Could not open the print dialog. Allow pop-ups for this site and try again.');
}

function printClassicPayslipHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Payslip print');
  frame.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:0',
    'height:0',
    'border:0',
    'visibility:hidden',
  ].join(';');
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument ?? win?.document;
  if (!doc || !win) {
    document.body.removeChild(frame);
    openClassicPayslipWindowFallback(html);
    return;
  }

  const cleanup = () => {
    window.setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 1500);
  };

  doc.open();
  doc.write(html);
  doc.close();

  void (async () => {
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
      window.setTimeout(() => resolve(), 500);
    });
    await waitForPayslipImages(doc);
    try {
      win.focus();
      win.print();
    } finally {
      cleanup();
    }
  })();
}

export function buildBulkPayslipsContentHtml(
  rows: FmPayrollRosterRow[],
  periodLabel: string,
  opts: FmPayslipPrintOptions = {},
) {
  const logoDataUrl = opts.logoDataUrl ?? readLogoFromStorage();
  return rows
    .map((row) =>
      buildClassicPayslipPageHtml(
        resolveClassicPayslipModel(row, periodLabel, { ...opts, logoDataUrl }),
      ),
    )
    .join('');
}

export function buildClassicPayslipPreviewHtml(
  row: FmPayrollRosterRow,
  periodLabel: string,
  opts: FmPayslipPrintOptions = {},
) {
  const logoDataUrl = opts.logoDataUrl ?? readLogoFromStorage();
  const pageHtml = buildClassicPayslipPageHtml(
    resolveClassicPayslipModel(row, periodLabel, { ...opts, logoDataUrl }),
  );
  return `<style>${CLASSIC_PAYSLIP_PRINT_CSS}</style>${pageHtml}`;
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
  const logoDataUrl = readLogoFromStorage();
  const pages = rows.map((row) =>
    resolveClassicPayslipModel(row, periodLabel, { logoDataUrl }),
  );
  printClassicPayslipHtml(
    buildClassicPayslipDocumentHtml(pages, `Payslips — ${selectionLabel} — ${periodLabel}`, {
      autoPrint: false,
    }),
  );
}

export async function downloadBulkPayslipPdf(
  rows: FmPayrollRosterRow[],
  periodLabel: string,
  selectionLabel: string,
) {
  if (rows.length === 0) return;
  await downloadClassicPayslipPdf({
    filename: bulkPayslipFilenameSlug(selectionLabel, periodLabel),
    rows,
    periodLabel,
    title: `Payslips — ${selectionLabel}`,
  });
}

export function openPayslipPrint(row: FmPayrollRosterRow, periodLabel: string) {
  const logoDataUrl = readLogoFromStorage();
  const model = resolveClassicPayslipModel(row, periodLabel, { logoDataUrl });
  printClassicPayslipHtml(
    buildClassicPayslipDocumentHtml([model], `Payslip — ${row.name} — ${periodLabel}`, {
      autoPrint: false,
    }),
  );
}

export async function downloadPayslipPdf(row: FmPayrollRosterRow, periodLabel: string) {
  const safeName = row.empNumber.replace(/[^A-Z0-9-]/gi, '_');
  await downloadClassicPayslipPdf({
    filename: `payslip-${safeName}-${periodLabel.replace(/\s+/g, '-')}`,
    rows: [row],
    periodLabel,
    title: `Payslip — ${row.name}`,
  });
}

async function downloadClassicPayslipPdf(opts: {
  filename: string;
  rows: FmPayrollRosterRow[];
  periodLabel: string;
  title: string;
}) {
  const logoDataUrl = readLogoFromStorage();
  const pages = opts.rows.map((row) =>
    resolveClassicPayslipModel(row, opts.periodLabel, { logoDataUrl }),
  );
  const html = buildClassicPayslipDocumentHtml(pages, opts.title, {
    autoPrint: false,
    forPdf: true,
  });

  const frame = document.createElement('iframe');
  frame.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    `width:${PAYSLIP_PAGE_W_PX}px`,
    `height:${PAYSLIP_PAGE_H_PX}px`,
    'border:0',
    'overflow:hidden',
  ].join(';');
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    document.body.removeChild(frame);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    frame.onload = done;
    window.setTimeout(done, 500);
  });

  const pageEls = [...doc.body.querySelectorAll('.payslip-page')] as HTMLElement[];
  await Promise.all(
    pageEls.flatMap((pageEl) =>
      [...pageEl.querySelectorAll('img')].map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.onload = () => resolve();
            img.onerror = () => resolve();
            window.setTimeout(() => resolve(), 400);
          }),
      ),
    ),
  );

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const pdf = new jsPDF({ orientation: 'p', unit: 'in', format: [5.5, 11] });
    const pageWidthIn = 5.5;
    const pageHeightIn = 11;

    for (let i = 0; i < pageEls.length; i += 1) {
      const pageEl = pageEls[i];
      const captureW = pageEl.offsetWidth || PAYSLIP_PAGE_W_PX;
      const captureH = pageEl.offsetHeight || PAYSLIP_PAGE_H_PX;

      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: captureW,
        height: captureH,
        windowWidth: captureW,
        windowHeight: captureH,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgHeightIn = (canvas.height * pageWidthIn) / canvas.width;

      if (i > 0) pdf.addPage([5.5, 11], 'p');
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidthIn, Math.min(imgHeightIn, pageHeightIn));
    }

    pdf.save(opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`);
  } finally {
    document.body.removeChild(frame);
  }
}

export type FmPayslipPreviewSection = {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  danger?: boolean;
  success?: boolean;
};

export function payslipPreviewSections(
  row: FmPayrollRosterRow,
  periodLabel: string,
): FmPayslipPreviewSection[] {
  const model = resolveClassicPayslipModel(row, periodLabel);
  return [
    { label: 'Pay period', value: periodTitleFromLabel(periodLabel) },
    { label: 'EPF No', value: model.epfNo, mono: true },
    { label: 'Rank', value: model.rank },
    { label: 'Site', value: model.site },
    { label: 'Total shifts', value: shiftsDisplay(model.totalShifts), mono: true },
    { label: 'Days', value: shiftsDisplay(model.daysWorked), mono: true },
    ...model.shiftTypeLines.map((line) => ({
      label: line.label,
      value: `${shiftsDisplay(line.shifts)} · ${lkrDisplay(line.amountLkr)}`,
      mono: true,
    })),
    { label: 'APIT (PAYE)', value: lkrDisplay(model.deductionRows.find((r) => r.label.startsWith('APIT'))?.amountLkr ?? 0), mono: true },
    { label: 'Stamp Duty', value: lkrDisplay(model.deductionRows.find((r) => r.label === 'Stamp Duty')?.amountLkr ?? 0), mono: true },
    { label: 'Total earnings', value: lkrDisplay(model.totalEarningsLkr), highlight: true },
    { label: 'Total deductions', value: lkrDisplay(model.totalDeductionsLkr), danger: true },
    { label: 'Net to bank', value: lkrDisplay(model.netPayLkr), success: true },
    { label: 'Bank', value: `${model.bankName} · ${model.bankAccountNo}` },
    { label: 'Reference', value: row.payslipId, mono: true },
  ];
}
