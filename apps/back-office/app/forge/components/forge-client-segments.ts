export const FORGE_CLIENT_SEGMENTS = [
  {
    id: 'wfm',
    label: 'WFM Tool',
    shortLabel: 'WFM',
    description: 'Workforce & hospitality subscribers and their billings',
    accent: 'sky',
  },
  {
    id: 'custom',
    label: 'Custom Software',
    shortLabel: 'Custom',
    description: 'Enterprise builds, milestones, and project invoices',
    accent: 'indigo',
  },
  {
    id: 'websites',
    label: 'Web Managers',
    shortLabel: 'Websites',
    description: 'Independent sales partners, their website clients, PEARS shops & revenue share',
    accent: 'emerald',
  },
] as const;

export type ForgeClientSegment = (typeof FORGE_CLIENT_SEGMENTS)[number]['id'];

export const DEFAULT_FORGE_CLIENT_SEGMENT: ForgeClientSegment = 'wfm';

export function parseForgeClientSegment(value: string | null | undefined): ForgeClientSegment {
  if (value === 'custom' || value === 'websites' || value === 'wfm') return value;
  return DEFAULT_FORGE_CLIENT_SEGMENT;
}

const SEGMENT_ACCENT: Record<
  ForgeClientSegment,
  { active: string; idle: string; dot: string }
> = {
  wfm: {
    active: 'border-sky-300 bg-sky-50 text-sky-800 shadow-sm shadow-sky-100',
    idle: 'border-transparent text-slate-500 hover:border-sky-100 hover:bg-sky-50/60 hover:text-sky-700',
    dot: 'bg-sky-500',
  },
  custom: {
    active: 'border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm shadow-indigo-100',
    idle: 'border-transparent text-slate-500 hover:border-indigo-100 hover:bg-indigo-50/60 hover:text-indigo-700',
    dot: 'bg-indigo-500',
  },
  websites: {
    active: 'border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-100',
    idle: 'border-transparent text-slate-500 hover:border-emerald-100 hover:bg-emerald-50/60 hover:text-emerald-700',
    dot: 'bg-emerald-500',
  },
};

export function forgeSegmentAccent(segment: ForgeClientSegment) {
  return SEGMENT_ACCENT[segment];
}
