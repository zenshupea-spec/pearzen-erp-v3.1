import { BULK_IMPORT_DEBT_PLAN_NOTE } from '../../../lib/bulk-data-import';
import type { FmPortfolioDeduction } from './fm-employee-deduction-plans';

const BULK_PLAN_PREFIX = `${BULK_IMPORT_DEBT_PLAN_NOTE} — `;

export function normalizeDebtNote(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Strip bulk-import plan boilerplate; keep operator-facing note text. */
export function cleanDebtPlanNote(notes: string | null | undefined): string | null {
  const raw = normalizeDebtNote(notes);
  if (!raw) return null;
  if (raw === BULK_IMPORT_DEBT_PLAN_NOTE) return null;
  if (raw.startsWith(BULK_PLAN_PREFIX)) {
    return normalizeDebtNote(raw.slice(BULK_PLAN_PREFIX.length));
  }
  return raw;
}

export function extractDebtNoteFromDeductions(
  deductions: Pick<FmPortfolioDeduction, 'notes'>[] | undefined,
): string | null {
  if (!deductions?.length) return null;
  for (const row of deductions) {
    const cleaned = cleanDebtPlanNote(row.notes);
    if (cleaned) return cleaned;
  }
  return null;
}

export function resolveEmployeeDebtNote(input: {
  debtNotes?: string | null;
  deductions?: Pick<FmPortfolioDeduction, 'notes'>[];
}): string | null {
  return normalizeDebtNote(input.debtNotes) ?? extractDebtNoteFromDeductions(input.deductions);
}

export function rosterRowHasDebtNote(debtNote: string | null | undefined): boolean {
  return Boolean(normalizeDebtNote(debtNote));
}
