export const ROLLING_DAYS = 14;

export const CAFE_SHIFT_TYPES = ['MORNING', 'EVENING'] as const;
export type CafeShiftType = (typeof CAFE_SHIFT_TYPES)[number];

/** Legacy roster rows may still use DAY — treat as morning. */
export function normalizeCafeShiftType(value: string | null | undefined): CafeShiftType | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'MORNING' || raw === 'DAY') return 'MORNING';
  if (raw === 'EVENING') return 'EVENING';
  return null;
}

export function cafeShiftLabel(shiftType: CafeShiftType): string {
  return shiftType === 'MORNING' ? 'Morning' : 'Evening';
}

export function cafeShiftShortLabel(shiftType: CafeShiftType): string {
  return shiftType === 'MORNING' ? 'AM' : 'PM';
}

export function nextCafeShiftType(current: CafeShiftType | null): CafeShiftType | null {
  if (!current) return 'MORNING';
  if (current === 'MORNING') return 'EVENING';
  return null;
}

export function buildRollingWindow(startDate?: string | null): {
  windowStart: string;
  days: string[];
} {
  const base =
    startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? new Date(`${startDate}T12:00:00`)
      : new Date();

  if (Number.isNaN(base.getTime())) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return buildRollingWindow(today.toISOString().slice(0, 10));
  }

  base.setHours(12, 0, 0, 0);
  const windowStart = base.toISOString().slice(0, 10);
  const days = Array.from({ length: ROLLING_DAYS }, (_, index) => {
    const day = new Date(base);
    day.setDate(day.getDate() + index);
    return day.toISOString().slice(0, 10);
  });

  return { windowStart, days };
}

export function rosterCellKey(employeeId: string, date: string): string {
  return `${employeeId}|${date}`;
}

/** Human-readable café branch label from site directory fields (avoids "Café — x · Café — x"). */
export function formatCafeBranchLabel(siteName: string, clientName: string): string {
  const name = siteName.trim();
  const client = clientName.trim();
  if (!name && !client) return 'Café Branch';
  if (name && client && name.toLowerCase() === client.toLowerCase()) return name;
  if (name && !client) return name;
  if (!name && client) return client;
  return `${name} · ${client}`;
}
