export type GuardRawMetrics = {
  empNumber: string;
  penaltyCount12m: number;
  penaltyAmount12m: number;
  lateCheckIns12m: number;
  shiftsPerMonth: number;
  maxConsecutiveMissedDays: number;
  deductionTotal12m: number;
};

export type GuardMetricScores = {
  penalties: number;
  lateCheckIns: number;
  shiftVolume: number;
  attendanceStreak: number;
  deductions: number;
};

export type GuardRatingRow = GuardRawMetrics & {
  scores: GuardMetricScores;
  rating: number;
};

const WEIGHTS = {
  penalties: 0.2,
  lateCheckIns: 0.2,
  shiftVolume: 0.2,
  attendanceStreak: 0.2,
  deductions: 0.2,
} as const;

function minMax(values: number[]) {
  if (!values.length) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Lower raw value → higher score (0–100). */
export function scoreLowerIsBetter(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 50;
  if (max <= min) return value <= min ? 100 : 50;
  const t = (value - min) / (max - min);
  return Math.round(Math.max(0, Math.min(100, (1 - t) * 100)));
}

/** Higher raw value → higher score (0–100). */
export function scoreHigherIsBetter(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 50;
  if (max <= min) return value >= max ? 100 : 50;
  const t = (value - min) / (max - min);
  return Math.round(Math.max(0, Math.min(100, t * 100)));
}

export function computeGuardRatings(rows: GuardRawMetrics[]): GuardRatingRow[] {
  if (!rows.length) return [];

  const penaltyCounts = rows.map((r) => r.penaltyCount12m);
  const penaltyAmounts = rows.map((r) => r.penaltyAmount12m);
  const lateCounts = rows.map((r) => r.lateCheckIns12m);
  const shifts = rows.map((r) => r.shiftsPerMonth);
  const missed = rows.map((r) => r.maxConsecutiveMissedDays);
  const deductions = rows.map((r) => r.deductionTotal12m);

  const pc = minMax(penaltyCounts);
  const pa = minMax(penaltyAmounts);
  const lc = minMax(lateCounts);
  const sh = minMax(shifts);
  const ms = minMax(missed);
  const dd = minMax(deductions);

  const rated = rows.map((row) => {
    const penaltyScore = Math.round(
      (scoreLowerIsBetter(row.penaltyCount12m, pc.min, pc.max) +
        scoreLowerIsBetter(row.penaltyAmount12m, pa.min, pa.max)) /
        2,
    );
    const scores: GuardMetricScores = {
      penalties: penaltyScore,
      lateCheckIns: scoreLowerIsBetter(row.lateCheckIns12m, lc.min, lc.max),
      shiftVolume: scoreHigherIsBetter(row.shiftsPerMonth, sh.min, sh.max),
      attendanceStreak: scoreLowerIsBetter(row.maxConsecutiveMissedDays, ms.min, ms.max),
      deductions: scoreLowerIsBetter(row.deductionTotal12m, dd.min, dd.max),
    };

    const rating = Math.round(
      scores.penalties * WEIGHTS.penalties +
        scores.lateCheckIns * WEIGHTS.lateCheckIns +
        scores.shiftVolume * WEIGHTS.shiftVolume +
        scores.attendanceStreak * WEIGHTS.attendanceStreak +
        scores.deductions * WEIGHTS.deductions,
    );

    return { ...row, scores, rating };
  });

  return rated.sort((a, b) => b.rating - a.rating);
}

export function ratingTier(rating: number): 'gold' | 'silver' | 'bronze' | 'risk' {
  if (rating >= 85) return 'gold';
  if (rating >= 70) return 'silver';
  if (rating >= 55) return 'bronze';
  return 'risk';
}
