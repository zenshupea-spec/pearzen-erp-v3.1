/** Client fallback when DB lock table is not migrated (preview / local dev). */
export const DEDUCTION_MONTH_LOCK_STORAGE_KEY = 'pearzen:deduction-month-lock:v1';

export type ClientDeductionMonthLockMap = Record<string, string>;

function readMap(): ClientDeductionMonthLockMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DEDUCTION_MONTH_LOCK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ClientDeductionMonthLockMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: ClientDeductionMonthLockMap) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEDUCTION_MONTH_LOCK_STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent('deduction-month-lock-changed'));
}

export function getClientDeductionMonthLockedAt(payrollMonth: string): string | null {
  return readMap()[payrollMonth] ?? null;
}

export function setClientDeductionMonthLock(payrollMonth: string) {
  const map = readMap();
  map[payrollMonth] = new Date().toISOString();
  writeMap(map);
}

export function subscribeDeductionMonthLock(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange();
  window.addEventListener('deduction-month-lock-changed', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('deduction-month-lock-changed', handler);
    window.removeEventListener('storage', handler);
  };
}

export function payrollMonthFromFmPeriod(period: { year: number; month: number }): string {
  return `${period.year}-${String(period.month).padStart(2, '0')}-01`;
}
