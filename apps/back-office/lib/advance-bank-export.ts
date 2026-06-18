import type { BankExportFormatId } from '../../../packages/bank-export-settings';
import {
  generateBankTransferTxt,
  generateOtherBankTransferTxt,
  triggerBankTxtDownload,
} from './payroll-batch-workflow';

export type AdvanceBankLine = {
  empNumber: string;
  name: string;
  amount: number;
};

export function generateAdvanceBankCsv(
  groupLabel: string,
  lines: AdvanceBankLine[],
): string {
  const header = 'EMP_NO,ACCOUNT_NO,AMOUNT,BENEFICIARY_NAME';
  const rows = lines.map(
    (line) =>
      `${line.empNumber},ACC-${line.empNumber.replace(/[^A-Z0-9]/gi, '')}-001,${line.amount},${line.name}`,
  );
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return [
    header,
    ...rows,
    `SUMMARY,${groupLabel.replace(/\s+/g, '_').toUpperCase()},${lines.length},${total}`,
  ].join('\n');
}

export function generateAdvanceBankTxt(
  groupLabel: string,
  lines: AdvanceBankLine[],
  otherBank = false,
): string {
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  if (otherBank) {
    return generateOtherBankTransferTxt(groupLabel, total, lines.length);
  }
  return generateBankTransferTxt(groupLabel, total, lines.length);
}

export function triggerAdvanceBankDownload(
  filename: string,
  content: string,
  formatId: BankExportFormatId,
) {
  const mime = formatId === 'commercial_csv' ? 'text/csv' : 'text/plain';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function advanceBankFilename(
  groupLabel: string,
  periodSlug: string,
  formatId: BankExportFormatId,
  otherBank = false,
): string {
  const safeLabel = groupLabel.replace(/\s+/g, '_');
  if (otherBank) return `Advance_Other_Banks_${safeLabel}_${periodSlug}.txt`;
  const ext = formatId === 'commercial_csv' ? 'csv' : 'txt';
  return `Advance_Commercial_Bank_${safeLabel}_${periodSlug}.${ext}`;
}

/** @deprecated Use triggerAdvanceBankDownload — kept for callers using payroll helper. */
export { triggerBankTxtDownload };
