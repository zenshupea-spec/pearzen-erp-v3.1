export type ApitSlab = {
  id: number;
  min: number;
  max: number | null;
  rate: number;
};

/** IRD monthly thresholds per Inland Revenue (Amendment) Act No. 02 of 2025 */
export const DEFAULT_APIT_SLABS: ApitSlab[] = [
  { id: 1, min: 0, max: 150_000, rate: 0 },
  { id: 2, min: 150_000, max: 233_333, rate: 6 },
  { id: 3, min: 233_333, max: 275_000, rate: 18 },
  { id: 4, min: 275_000, max: 316_667, rate: 24 },
  { id: 5, min: 316_667, max: 358_334, rate: 30 },
  { id: 6, min: 358_334, max: null, rate: 36 },
];

export const DEFAULT_STAMP_DUTY_LKR = 25;

export function parseApitSlabs(raw: unknown): ApitSlab[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_APIT_SLABS;
  const parsed = raw
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const min = Math.max(0, Math.round(Number(r.min ?? 0)));
      const maxRaw = r.max;
      const max =
        maxRaw === null || maxRaw === undefined || maxRaw === ''
          ? null
          : Math.max(min, Math.round(Number(maxRaw)));
      const rate = Math.min(100, Math.max(0, Number(r.rate ?? 0)));
      const id = Math.round(Number(r.id ?? index + 1));
      return { id, min, max, rate } satisfies ApitSlab;
    })
    .filter((s): s is ApitSlab => s !== null)
    .sort((a, b) => a.min - b.min);

  return parsed.length > 0 ? parsed : DEFAULT_APIT_SLABS;
}

export function parseStampDutyLkr(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : DEFAULT_STAMP_DUTY_LKR;
}

/** Progressive APIT using configured IRD slabs */
export function calcApit(gross: number, slabs: ApitSlab[]): number {
  if (slabs.length === 0 || gross <= 0) return 0;
  const sorted = [...slabs].sort((a, b) => a.min - b.min);
  let tax = 0;
  for (const slab of sorted) {
    if (gross <= slab.min) break;
    const slabTop = slab.max !== null ? slab.max : Infinity;
    const taxable = Math.min(gross, slabTop) - slab.min;
    if (taxable > 0 && slab.rate > 0) {
      tax += (taxable * slab.rate) / 100;
    }
  }
  return Math.round(tax);
}
