'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Coffee,
  KeyRound,
  Megaphone,
  UserPlus,
} from 'lucide-react';
import { CVS_BRAND_CLASSES } from '../../lib/cvs-brand-tokens';
import { CVS_INTERNAL_WORKFORCE_ONLY } from '../../lib/cvs-workforce-phase';

type PillKey =
  | 'mnr'
  | 'vacancies'
  | 'onboarding'
  | 'temp-roster'
  | 'cafe-roster'
  | 'sm-portal'
  | 'head-office-portal'
  | 'cafe-portal'
  | 'shalom-portal';

function pillClass(active: boolean, tone: 'rose' | 'white' | 'amber' | 'orange' | 'teal' | 'violet') {
  if (active) {
    return `${CVS_BRAND_CLASSES.mobileTabActive} text-xs font-black uppercase tracking-wider border`;
  }
  if (tone === 'white') {
    return 'bg-white border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wide hover:bg-[var(--cvs-accent-soft)]/80 hover:text-[color:var(--cvs-accent)] hover:border-[color:var(--cvs-accent-muted)]';
  }
  if (tone === 'amber') {
    return 'bg-amber-50 border-amber-200 text-amber-800 text-xs font-black uppercase tracking-wider hover:bg-amber-100';
  }
  if (tone === 'teal') {
    return 'bg-teal-50 border-teal-200 text-teal-800 text-xs font-black uppercase tracking-wider hover:bg-teal-100';
  }
  if (tone === 'violet') {
    return 'bg-violet-50 border-violet-200 text-violet-800 text-xs font-black uppercase tracking-wider hover:bg-violet-100';
  }
  if (tone === 'rose') {
    return 'bg-white border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wide hover:bg-[var(--cvs-accent-soft)]/80 hover:text-[color:var(--cvs-accent)] hover:border-[color:var(--cvs-accent-muted)]';
  }
  return 'bg-orange-50 border-orange-200 text-orange-800 text-xs font-black uppercase tracking-wider hover:bg-orange-100';
}

export default function HrHubPills() {
  const pathname = usePathname() ?? '';

  const active = (key: PillKey): boolean => {
    if (key === 'mnr') return pathname === '/hr/mnr' || pathname.startsWith('/hr/mnr/');
    return pathname.startsWith(`/hr/${key}`);
  };

  const wrap = (key: PillKey, tone: 'rose' | 'white' | 'amber' | 'orange' | 'teal' | 'violet', children: ReactNode) => {
    const className = `inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${pillClass(active(key), tone)}`;
    if (active(key)) return <span className={className}>{children}</span>;
    const href = key === 'mnr' ? '/hr/mnr' : `/hr/${key}`;
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  };

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:border-t sm:border-slate-100 sm:pb-0">
      {wrap(
        'mnr',
        'rose',
        <>
          <BookOpen className="w-3.5 h-3.5" /> Master Nominal Roll
        </>,
      )}
      <div className="w-px h-5 bg-slate-200 mx-0.5" />
      {!CVS_INTERNAL_WORKFORCE_ONLY
        ? wrap(
            'vacancies',
            'white',
            <>
              <Megaphone className="w-3.5 h-3.5 text-rose-600" /> Vacancies
            </>,
          )
        : null}
      {wrap(
        'onboarding',
        'white',
        <>
          <UserPlus className="w-3.5 h-3.5 text-rose-600" /> Onboarding
        </>,
      )}
      {!CVS_INTERNAL_WORKFORCE_ONLY
        ? wrap(
            'temp-roster',
            'white',
            <>
              <ClipboardList className="w-3.5 h-3.5 text-violet-600" /> Temp Roster
            </>,
          )
        : null}
      {wrap(
        'cafe-roster',
        'orange',
        <>
          <CalendarDays className="w-3.5 h-3.5" /> Café Roster
        </>,
      )}
      {!CVS_INTERNAL_WORKFORCE_ONLY
        ? wrap(
            'sm-portal',
            'amber',
            <>
              <KeyRound className="w-3.5 h-3.5" /> SM Portal
            </>,
          )
        : null}
      {wrap(
        'head-office-portal',
        'violet',
        <>
          <KeyRound className="w-3.5 h-3.5" /> HQ Portal
        </>,
      )}
      {wrap(
        'cafe-portal',
        'orange',
        <>
          <Coffee className="w-3.5 h-3.5" /> Café Front
        </>,
      )}
      {wrap(
        'shalom-portal',
        'teal',
        <>
          <Building2 className="w-3.5 h-3.5" /> Shalom Front
        </>,
      )}
    </div>
  );
}
