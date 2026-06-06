/** Minimum on-hand qty before HQ should reorder (active employees ÷ 10, at least 1). */
export function uniformReorderMinQty(activeEmployeeCount: number): number {
  return Math.max(1, Math.floor(activeEmployeeCount / 10));
}
