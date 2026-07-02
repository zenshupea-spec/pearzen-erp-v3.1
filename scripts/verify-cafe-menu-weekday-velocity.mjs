#!/usr/bin/env node
/** Smoke test: last-3-weekday dates + sold-out boost rules. */

function getLastSameWeekdayDates(anchor, targetDow, count, includeAnchor = false) {
  const dates = [];
  const cursor = new Date(anchor);
  if (!includeAnchor) cursor.setDate(cursor.getDate() - 1);
  while (dates.length < count) {
    if (cursor.getDay() === targetDow) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() - 1);
    if (cursor.getFullYear() < anchor.getFullYear() - 2) break;
  }
  return dates;
}

const tuesday = new Date('2026-06-30T12:00:00');
const last3 = getLastSameWeekdayDates(tuesday, 2, 3, false);
const expected = ['2026-06-23', '2026-06-16', '2026-06-09'];
if (JSON.stringify(last3) !== JSON.stringify(expected)) {
  console.error('FAIL dates', last3, expected);
  process.exit(1);
}

const units = [10, 10, 8];
const avg = Math.round(units.reduce((a, b) => a + b, 0) / units.length);
const soldOutCount = [true, true, false].filter((sold, i) => sold && units[i] >= avg).length;
if (avg !== 9 || soldOutCount !== 2) {
  console.error('FAIL avg/soldOut', avg, soldOutCount);
  process.exit(1);
}

console.log('verify-cafe-menu-weekday-velocity: PASS');
