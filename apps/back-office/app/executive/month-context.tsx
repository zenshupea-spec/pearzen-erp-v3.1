'use client';

import React, { createContext, useContext, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthYearState {
  month: number;   // 1-indexed (1 = January)
  year: number;
  label: string;   // e.g. "May 2026"
}

interface MonthYearContextValue extends MonthYearState {
  setMonthYear: (month: number, year: number) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function makeLabel(month: number, year: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export const MonthYearContext = createContext<MonthYearContextValue>({
  month: 5,
  year: 2026,
  label: 'May 2026',
  setMonthYear: () => undefined,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MonthYearProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MonthYearState>({
    month: 5,
    year: 2026,
    label: makeLabel(5, 2026),
  });

  const setMonthYear = (month: number, year: number) =>
    setState({ month, year, label: makeLabel(month, year) });

  return (
    <MonthYearContext.Provider value={{ ...state, setMonthYear }}>
      {children}
    </MonthYearContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMonthYear() {
  return useContext(MonthYearContext);
}
