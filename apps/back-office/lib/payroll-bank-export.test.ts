import { describe, expect, it } from 'vitest';

import {
  assertPayrollBankExportAllowed,
  buildPayrollBankLine,
  extractPayrollBankSummaryNet,
  filterPayrollBankLinesForExport,
  generatePayrollBankFileContent,
  payrollBankLinesNetTotal,
  type PayrollBankLine,
} from './payroll-bank-export';

const sampleLines: PayrollBankLine[] = [
  {
    empNo: 'CVS-001',
    accountNo: '1234567890',
    amount: 34603.41,
    beneficiary: 'JANE DOE',
    bankName: 'COMMERCIAL BANK',
    isCommercialBank: true,
  },
  {
    empNo: 'CVS-002',
    accountNo: '9876543210',
    amount: 115344.82,
    beneficiary: 'JOHN SMITH',
    bankName: 'COMMERCIAL BANK',
    isCommercialBank: true,
  },
];

describe('payroll bank export', () => {
  it('rejects DRAFT and SUBMITTED payroll runs', () => {
    expect(() => assertPayrollBankExportAllowed('DRAFT')).toThrow(/MD-approved/);
    expect(() => assertPayrollBankExportAllowed('SUBMITTED')).toThrow(/MD-approved/);
    expect(() => assertPayrollBankExportAllowed('APPROVED')).not.toThrow();
    expect(() => assertPayrollBankExportAllowed('PAID')).not.toThrow();
  });

  it('uses payslip net totals in CSV SUMMARY', () => {
    const content = generatePayrollBankFileContent({
      groupLabel: 'Security Firm Personnel',
      periodSlug: '202605',
      formatId: 'commercial_csv',
      lines: sampleLines,
    });

    const summaryNet = extractPayrollBankSummaryNet(content);
    expect(summaryNet).toBe(Math.round(payrollBankLinesNetTotal(sampleLines)));
    expect(summaryNet).toBe(149948);
  });

  it('uses payslip net totals in TXT SUMMARY', () => {
    const content = generatePayrollBankFileContent({
      groupLabel: 'Guards Commercial',
      periodSlug: '202605',
      formatId: 'commercial_txt',
      lines: sampleLines,
    });

    expect(content).toContain('SUMMARY|RECIPIENTS=2|NET=149948');
    expect(extractPayrollBankSummaryNet(content)).toBe(149948);
  });

  it('isolates non-commercial bank lines when configured', () => {
    const mixed: PayrollBankLine[] = [
      ...sampleLines,
      {
        empNo: 'CVS-003',
        accountNo: '555',
        amount: 5000,
        beneficiary: 'OTHER BANK GUARD',
        bankName: 'SAMPATH BANK',
        isCommercialBank: false,
      },
    ];

    const commercialOnly = filterPayrollBankLinesForExport(mixed, {
      groupId: 'security',
      isolateExternalBank: true,
      otherBank: false,
    });
    expect(commercialOnly).toHaveLength(2);

    const otherOnly = filterPayrollBankLinesForExport(mixed, {
      groupId: 'security',
      isolateExternalBank: true,
      cohort: 'guard_other_bank',
      otherBank: true,
    });
    expect(otherOnly).toHaveLength(1);
    expect(otherOnly[0]?.empNo).toBe('CVS-003');
  });

  it('skips employees without bank account on file', () => {
    expect(
      buildPayrollBankLine({
        empNo: 'CVS-004',
        fullName: 'No Bank',
        bankName: 'UNKNOWN',
        accountNumber: '123',
        netPay: 1000,
      }),
    ).toBeNull();
  });
});
