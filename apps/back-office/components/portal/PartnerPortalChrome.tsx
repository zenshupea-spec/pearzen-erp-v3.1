'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { signOutPartner } from '../../app/partners/actions';

const NAV_ITEMS = [
  { href: '/partners', label: 'Home' },
  { href: '/partners/portfolio', label: 'Portfolio' },
  { href: '/partners/payouts', label: 'Payouts' },
];

export default function PartnerPortalChrome() {
  const pathname = usePathname();

  return (
    <header className="mb-8 border-b border-cyan-500/20 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-500">
            Pearzen Partners
          </p>
          <h1 className="text-lg font-black text-white uppercase tracking-tight">
            Service Partner Workspace
          </h1>
        </div>
        <form action={signOutPartner}>
          <button
            type="submit"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:border-slate-500"
          >
            Sign out
          </button>
        </form>
      </div>
      <nav className="mt-4 flex flex-wrap gap-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                active
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                  : 'border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              {item.label}
              {item.badge ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
