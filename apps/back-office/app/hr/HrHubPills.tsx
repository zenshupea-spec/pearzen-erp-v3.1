'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Coffee,
  KeyRound,
  Megaphone,
  UserPlus,
} from 'lucide-react';

type PillKey =
  | 'mnr'
  | 'vacancies'
  | 'onboarding'
  | 'temp-roster'
  | 'cafe-roster'
  | 'sm-portal'
  | 'cafe-portal';

function pillClass(active: boolean, tone: 'rose' | 'white' | 'amber' | 'orange') {
  if (active && tone === 'rose') {
    return 'bg-rose-50 border-rose-200 text-rose-700 text-xs font-black uppercase tracking-wider';
  }
  if (tone === 'white') {
    return 'bg-white border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wide hover:bg-slate-50';
  }
  if (tone === 'amber') {
    return 'bg-amber-50 border-amber-200 text-amber-800 text-xs font-black uppercase tracking-wider hover:bg-amber-100';
  }
  return 'bg-orange-50 border-orange-200 text-orange-800 text-xs font-black uppercase tracking-wider hover:bg-orange-100';
}

export default function HrHubPills() {
  const pathname = usePathname() ?? '';

  const active = (key: PillKey): boolean => {
    if (key === 'mnr') return pathname === '/hr/mnr' || pathname.startsWith('/hr/mnr/');
    return pathname.startsWith(`/hr/${key}`);
  };

  const wrap = (key: PillKey, tone: 'rose' | 'white' | 'amber' | 'orange', children: ReactNode) => {
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
    <div className="flex flex-wrap items-center gap-2.5 mt-4 pt-4 border-t border-slate-100">
      {wrap(
        'mnr',
        'rose',
        <>
          <BookOpen className="w-3.5 h-3.5" /> Master Nominal Roll
        </>,
      )}
      <div className="w-px h-5 bg-slate-200 mx-0.5" />
      {wrap(
        'vacancies',
        'white',
        <>
          <Megaphone className="w-3.5 h-3.5 text-rose-600" /> Vacancies
        </>,
      )}
      {wrap(
        'onboarding',
        'white',
        <>
          <UserPlus className="w-3.5 h-3.5 text-rose-600" /> Onboarding
        </>,
      )}
      {wrap(
        'temp-roster',
        'white',
        <>
          <ClipboardList className="w-3.5 h-3.5 text-violet-600" /> Temp Roster
        </>,
      )}
      {wrap(
        'cafe-roster',
        'orange',
        <>
          <CalendarDays className="w-3.5 h-3.5" /> Café Roster
        </>,
      )}
      {wrap(
        'sm-portal',
        'amber',
        <>
          <KeyRound className="w-3.5 h-3.5" /> SM Portal
        </>,
      )}
      {wrap(
        'cafe-portal',
        'orange',
        <>
          <Coffee className="w-3.5 h-3.5" /> Café Front
        </>,
      )}
    </div>
  );
}
