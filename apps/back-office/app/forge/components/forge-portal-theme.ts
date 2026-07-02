/** Shared light-theme tokens for the Forge operator portal. */
export const FORGE_PORTAL_THEME = {
  page: 'min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-800 font-sans antialiased',
  header:
    'bg-white/85 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-50 shadow-sm shadow-slate-200/50',
  container: 'max-w-7xl mx-auto',
  headerTitle: 'text-lg font-bold text-slate-900 tracking-tight',
  headerSubtitle: 'text-[10px] text-violet-600 font-semibold uppercase tracking-[0.2em] mt-0.5',
  backButton:
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700',
  sectionLabel: 'text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em]',
  sectionDesc: 'mt-1 text-sm text-slate-500',
  card: 'bg-white border border-slate-200/90 rounded-2xl shadow-sm shadow-slate-200/40',
  cardHover: 'transition-all hover:border-violet-200 hover:shadow-md hover:shadow-violet-100/50',
  tableWrap: 'bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm',
  tableHead: 'bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-xs tracking-wider',
  tableRow: 'transition-colors hover:bg-slate-50/80',
  tableRowActive: 'bg-violet-50/60',
  muted: 'text-slate-500',
  accent: 'text-violet-600',
} as const;

export type ForgeCardAccent =
  | 'rose'
  | 'indigo'
  | 'sky'
  | 'amber'
  | 'emerald'
  | 'cyan'
  | 'violet';

export const FORGE_CARD_ACCENTS: Record<
  ForgeCardAccent,
  { hover: string; iconBg: string; iconBorder: string; iconText: string }
> = {
  rose: {
    hover: 'hover:border-rose-200 hover:shadow-rose-100/50',
    iconBg: 'bg-rose-50',
    iconBorder: 'border-rose-100',
    iconText: 'text-rose-500',
  },
  indigo: {
    hover: 'hover:border-indigo-200 hover:shadow-indigo-100/50',
    iconBg: 'bg-indigo-50',
    iconBorder: 'border-indigo-100',
    iconText: 'text-indigo-500',
  },
  sky: {
    hover: 'hover:border-sky-200 hover:shadow-sky-100/50',
    iconBg: 'bg-sky-50',
    iconBorder: 'border-sky-100',
    iconText: 'text-sky-500',
  },
  amber: {
    hover: 'hover:border-amber-200 hover:shadow-amber-100/50',
    iconBg: 'bg-amber-50',
    iconBorder: 'border-amber-100',
    iconText: 'text-amber-600',
  },
  emerald: {
    hover: 'hover:border-emerald-200 hover:shadow-emerald-100/50',
    iconBg: 'bg-emerald-50',
    iconBorder: 'border-emerald-100',
    iconText: 'text-emerald-600',
  },
  cyan: {
    hover: 'hover:border-cyan-200 hover:shadow-cyan-100/50',
    iconBg: 'bg-cyan-50',
    iconBorder: 'border-cyan-100',
    iconText: 'text-cyan-600',
  },
  violet: {
    hover: 'hover:border-violet-200 hover:shadow-violet-100/50',
    iconBg: 'bg-violet-50',
    iconBorder: 'border-violet-100',
    iconText: 'text-violet-600',
  },
};
