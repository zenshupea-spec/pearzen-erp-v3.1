'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: '/salon', label: 'Overview', exact: true },
  { href: '/salon/bookings', label: 'Bookings' },
  { href: '/salon/pos', label: 'POS' },
  { href: '/salon/catalog', label: 'Catalog' },
];

export default function SalonSubnav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex flex-wrap items-center gap-2 border-b border-rose-200/80 pb-4">
      {LINKS.map((link) => {
        const active =
          link.exact === true
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              active
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <Link
        href="/dashboard"
        className="ml-auto text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800"
      >
        ← HQ Hub
      </Link>
    </nav>
  );
}
