/** MD engine default — statutory weekly hours before OT rate applies (R-CAF-03). */
export const DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS = 48;

/** ISO week (Mon–Sun) bounds for a `YYYY-MM-DD` work date. */
export function cafeIsoWeekRange(workDate: string): { weekStart: string; weekEnd: string } {
  const anchor = new Date(`${workDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(anchor.getTime())) {
    return { weekStart: workDate, weekEnd: workDate };
  }

  const day = anchor.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

/**
 * OT hours for this shift — only the portion that pushes the rolling week above
 * `weeklyThresholdHours` (marginal hours, not whole-shift OT).
 */
export function cafeMarginalOtHours(input: {
  shiftHours: number;
  weeklyHoursBefore: number;
  weeklyThresholdHours?: number;
}): number {
  const shift = Math.max(0, Number(input.shiftHours) || 0);
  const before = Math.max(0, Number(input.weeklyHoursBefore) || 0);
  const threshold = Math.max(
    0,
    Number(input.weeklyThresholdHours ?? DEFAULT_CAFE_WEEKLY_OT_THRESHOLD_HOURS) || 0,
  );

  const otAfter = Math.max(0, before + shift - threshold);
  const otBefore = Math.max(0, before - threshold);
  return Math.round((otAfter - otBefore) * 100) / 100;
}
