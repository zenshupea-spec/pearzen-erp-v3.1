import type { BankExportFormatId } from '../../../packages/bank-export-settings';
import {
  classifyGuardCohort,
  hasBankOnFile,
  isCommercialBank,
  type GuardPayrollCohort,
} from '../app/fm/lib/guard-payroll-cohorts';
import { normalizeCorporatePayrollGroup } from '../app/fm/lib/payroll-earnings-display';
import {
  employeePayrollGroup,
  type PayrollGroupId,
  type PayrollRunDbStatus,
} from './payroll-run-types';

export type PayrollBankExportCohort =
  | GuardPayrollCohort
  | 'ho'
  | 'sm'
  | 'cafe';

export type PayrollBankLine = {
  empNo: string;
  accountNo: string;
  amount: number;
  beneficiary: string;
  bankName: string;
  isCommercialBank: boolean;
};

export function assertPayrollBankExportAllowed(status: PayrollRunDbStatus): void {
  if (status !== 'APPROVED' && status !== 'PAID') {
    throw new Error('Bank export requires an MD-approved payroll batch.');
  }
}

export function employeeMatchesPayrollBankCohort(
  employee: { group?: unknown; bank_name?: string | null },
  cohort: PayrollBankExportCohort | null | undefined,
): boolean {
  if (!cohort) return true;

  const payrollGroup = employeePayrollGroup(employee.group);
  if (cohort === 'cafe') return payrollGroup === 'cafe';

  if (payrollGroup !== 'security') return false;

  const corp = normalizeCorporatePayrollGroup(employee.group);
  if (cohort === 'ho') return corp === 'HEAD_OFFICE';
  if (cohort === 'sm') return corp === 'SECTOR_MANAGER';
  if (corp === 'HEAD_OFFICE' || corp === 'SECTOR_MANAGER') return false;

  return classifyGuardCohort('', employee.bank_name) === cohort;
}

export function buildPayrollBankLine(input: {
  empNo: string;
  fullName: string;
  bankName: string | null | undefined;
  accountNumber: string | null | undefined;
  netPay: number;
}): PayrollBankLine | null {
  const amount = Number(input.netPay);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!hasBankOnFile(input.bankName)) return null;

  const accountNo = (input.accountNumber ?? '').trim();
  if (!accountNo || accountNo === 'N/A') return null;

  const bankName = String(input.bankName ?? '').trim().toUpperCase();
  return {
    empNo: input.empNo,
    accountNo,
    amount,
    beneficiary: (input.fullName || 'UNNAMED EMPLOYEE').toUpperCase(),
    bankName,
    isCommercialBank: isCommercialBank(bankName),
  };
}

export function filterPayrollBankLinesForExport(
  lines: PayrollBankLine[],
  options: {
    cohort?: PayrollBankExportCohort | null;
    groupId: PayrollGroupId;
    isolateExternalBank: boolean;
    otherBank?: boolean;
  },
): PayrollBankLine[] {
  let filtered = lines;

  if (options.isolateExternalBank && options.groupId === 'security' && !options.cohort) {
    filtered = filtered.filter((line) => line.isCommercialBank);
  }

  if (options.otherBank) {
    filtered = filtered.filter((line) => !line.isCommercialBank);
  } else if (options.cohort === 'guard_commercial') {
    filtered = filtered.filter((line) => line.isCommercialBank);
  } else if (options.cohort === 'guard_other_bank') {
    filtered = filtered.filter((line) => !line.isCommercialBank);
  }

  return filtered;
}

export function payrollBankLinesNetTotal(lines: PayrollBankLine[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}

function quoteCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function generatePayrollBankFileContent(input: {
  groupLabel: string;
  periodSlug: string;
  formatId: BankExportFormatId;
  lines: PayrollBankLine[];
  otherBank?: boolean;
}): string {
  const total = payrollBankLinesNetTotal(input.lines);
  const roundedTotal = Math.round(total);
  const safeLabel = input.groupLabel.replace(/\s+/g, '_').toUpperCase();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (input.formatId === 'commercial_csv' && !input.otherBank) {
    const header = 'EMP_NO,ACCOUNT_NO,AMOUNT,BENEFICIARY_NAME';
    const rows = input.lines.map(
      (line) =>
        `${line.empNo},${line.accountNo},${Math.round(line.amount)},${quoteCsv(line.beneficiary)}`,
    );
    return [
      header,
      ...rows,
      `SUMMARY,${safeLabel},${input.lines.length},${roundedTotal}`,
    ].join('\n');
  }

  const hdr = input.otherBank
    ? 'HDR|Other Banks Export|PEARZEN ERP'
    : 'HDR|Commercial Bank v3.2|PEARZEN ERP';
  const batch = `BATCH|${safeLabel}|${date}`;
  const payLines = input.lines.map(
    (line) =>
      `PAY|${line.empNo}|${line.accountNo}|${Math.round(line.amount)}|${line.beneficiary.replace(/\|/g, ' ')}`,
  );
  const summary = input.otherBank
    ? `SUMMARY|RECIPIENTS=${input.lines.length}|NET=${roundedTotal}|DESTINATION=NON_COMMERCIAL`
    : `SUMMARY|RECIPIENTS=${input.lines.length}|NET=${roundedTotal}`;

  return [hdr, batch, ...payLines, summary, 'EOF'].join('\n');
}

export function extractPayrollBankSummaryNet(content: string): number | null {
  for (const line of content.split('\n')) {
    if (line.startsWith('SUMMARY,')) {
      const parts = line.split(',');
      const total = Number(parts[parts.length - 1]);
      return Number.isFinite(total) ? total : null;
    }
    const netMatch = line.match(/\|NET=(\d+)/);
    if (netMatch) {
      const total = Number(netMatch[1]);
      return Number.isFinite(total) ? total : null;
    }
  }
  return null;
}

export function payrollBankFilename(
  groupLabel: string,
  periodSlug: string,
  formatId: BankExportFormatId,
  otherBank = false,
): string {
  const safeLabel = groupLabel.replace(/\s+/g, '_');
  if (otherBank) return `Payroll_Other_Banks_${safeLabel}_${periodSlug}.txt`;
  const ext = formatId === 'commercial_csv' ? 'csv' : 'txt';
  return `Payroll_Commercial_Bank_${safeLabel}_${periodSlug}.${ext}`;
}

export function payrollBankMimeType(formatId: BankExportFormatId, otherBank = false): string {
  if (otherBank || formatId === 'commercial_txt') return 'text/plain';
  return 'text/csv';
}

export function triggerPayrollBankDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
