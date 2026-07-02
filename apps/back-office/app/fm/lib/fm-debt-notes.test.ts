import { describe, expect, it } from 'vitest';
import {
  cleanDebtPlanNote,
  extractDebtNoteFromDeductions,
  resolveEmployeeDebtNote,
} from './fm-debt-notes';

describe('fm-debt-notes', () => {
  it('prefers employee debt_notes over plan notes', () => {
    expect(
      resolveEmployeeDebtNote({
        debtNotes: 'Legacy loan from 2024',
        deductions: [{ notes: 'Bulk roster import — other note' }],
      }),
    ).toBe('Legacy loan from 2024');
  });

  it('cleans bulk import plan prefix from deduction notes', () => {
    expect(cleanDebtPlanNote('Bulk roster import — Salary loan recovery')).toBe(
      'Salary loan recovery',
    );
  });

  it('extracts first meaningful plan note', () => {
    expect(
      extractDebtNoteFromDeductions([
        { notes: 'Bulk roster import' },
        { notes: 'Bulk roster import — Unit damage instalment' },
      ]),
    ).toBe('Unit damage instalment');
  });

  it('returns null when no note exists', () => {
    expect(resolveEmployeeDebtNote({ debtNotes: null, deductions: [] })).toBeNull();
  });
});
