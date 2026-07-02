/** Light-theme tokens for Forge commerce sub-pages. */
import { FORGE_PORTAL_THEME as T } from './forge-portal-theme';

export const FORGE_COMMERCE_THEME = {
  ...T,
  accent: 'text-amber-700',
  accentBorder: 'border-amber-200',
  accentBg: 'bg-amber-50',
  hint: 'rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-900',
  error: 'rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700',
  success: 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800',
  input:
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100',
  inputCompact:
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100',
  label: 'text-xs font-bold uppercase tracking-wider text-slate-500',
  sectionTitle: 'text-sm font-bold uppercase tracking-widest text-slate-500',
  primaryBtn:
    'rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-amber-500 disabled:opacity-50',
  link: 'text-xs font-bold uppercase tracking-wider text-amber-700 hover:text-amber-900',
} as const;
