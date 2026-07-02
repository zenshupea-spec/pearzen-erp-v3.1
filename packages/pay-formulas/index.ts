export const GUARD_FORMULA_KEYS = [
  'standardWorkingDay',
  'otRatePerHour',
  'poyaDay',
  'publicHoliday',
  'statutory',
  'weeklyHolidaySunday',
  'saturdayHalfDay',
] as const;

export const CAFE_FORMULA_KEYS = [
  'standardShift',
  'otRatePerHour',
  'poyaDay',
  'publicHoliday',
  'statutoryHoliday',
  'weeklyHolidaySunday',
  'saturdayShift',
] as const;

export type GuardFormulaKey = (typeof GUARD_FORMULA_KEYS)[number];
export type CafeFormulaKey = (typeof CAFE_FORMULA_KEYS)[number];

export type GuardPayFormulas = Record<GuardFormulaKey, string>;
export type CafePayFormulas = Record<CafeFormulaKey, string>;

export type PayFormulasSettings = {
  guard: GuardPayFormulas;
  cafe: CafePayFormulas;
};

export const DEFAULT_GUARD_PAY_FORMULAS: GuardPayFormulas = {
  standardWorkingDay: '(B/26) + ((B/26) * (14/12) * (1/26)) + ((B/200) * 1.5 * 3)',
  otRatePerHour: '(B/200) * 1.5',
  poyaDay: '((B/26) * 1.5) + ((B/200) * 1.5 * 3)',
  publicHoliday: '(B/26) + ((B/26) * (14/12) * (1/26)) + ((B/200) * 1.5 * 3)',
  statutory: '(B/26) + ((B/26) * (14/12) * (1/26)) + ((B/200) * 1.5 * 3)',
  weeklyHolidaySunday: '(B/200) * 1.5 * 11',
  saturdayHalfDay: '((B/26) * (6/8)) + ((B/200) * 1.5 * 5)',
};

export const DEFAULT_CAFE_PAY_FORMULAS: CafePayFormulas = {
  standardShift: '(B/26)',
  otRatePerHour: '(B/26/9) * 1.5',
  poyaDay: '((B/26/9) * 1.5) * HRS',
  publicHoliday: '(B/26)',
  statutoryHoliday: '((B/26/9) * 1.5) * HRS',
  weeklyHolidaySunday: '(B/26)',
  saturdayShift: '(B/26)',
};

export const DEFAULT_PAY_FORMULAS: PayFormulasSettings = {
  guard: DEFAULT_GUARD_PAY_FORMULAS,
  cafe: DEFAULT_CAFE_PAY_FORMULAS,
};

function parseFormulaGroup<T extends string>(
  keys: readonly T[],
  defaults: Record<T, string>,
  raw: unknown,
): Record<T, string> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...defaults };
  for (const key of keys) {
    const val = source[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      out[key] = val.trim();
    }
  }
  return out;
}

export function parsePayFormulasSettings(raw: unknown): PayFormulasSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_PAY_FORMULAS;
  const row = raw as Record<string, unknown>;
  return {
    guard: parseFormulaGroup(GUARD_FORMULA_KEYS, DEFAULT_GUARD_PAY_FORMULAS, row.guard),
    cafe: parseFormulaGroup(CAFE_FORMULA_KEYS, DEFAULT_CAFE_PAY_FORMULAS, row.cafe),
  };
}

export type PayFormulaContext = {
  B: number;
  HRS?: number;
  wbWorkingDays?: number;
  wbHours?: number;
};

export function evaluatePayFormula(formula: string, ctx: PayFormulaContext): number {
  const B = ctx.B;
  const HRS = ctx.HRS ?? 9;
  const D = ctx.wbWorkingDays ?? 26;
  const H = ctx.wbHours ?? 200;

  try {
    let parsed = formula.trim();
    parsed = parsed.replace(/\[?B\]?/gi, String(B));
    parsed = parsed.replace(/\[?HRS\]?/gi, String(HRS));
    parsed = parsed.replace(/\(\s*B\s*\/\s*26\s*\)/gi, `(${B}/${D})`);
    parsed = parsed.replace(/\(\s*B\s*\/\s*200\s*\)/gi, `(${B}/${H})`);
    parsed = parsed.replace(/B\s*\/\s*26(?!\d)/gi, `${B}/${D}`);
    parsed = parsed.replace(/B\s*\/\s*200(?!\d)/gi, `${B}/${H}`);
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${parsed}`)();
    return Number.isFinite(result) ? Number(Number(result).toFixed(2)) : 0;
  } catch {
    return 0;
  }
}

export function evaluateGuardFormulaAtB(
  key: GuardFormulaKey,
  B: number,
  formulas: GuardPayFormulas = DEFAULT_GUARD_PAY_FORMULAS,
  ctx?: Omit<PayFormulaContext, 'B'>,
): number {
  return evaluatePayFormula(formulas[key], { B, ...ctx });
}
