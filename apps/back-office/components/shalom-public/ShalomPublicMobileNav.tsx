'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

import type { ShalomPublicNavItem } from '../../lib/shalom-public-path';

type ShalomPublicMobileNavProps = {
  navItems: ShalomPublicNavItem[];
};

export default function ShalomPublicMobileNav({ navItems }: ShalomPublicMobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--shalom-border)] bg-white/80 text-[color:var(--shalom-text)]"
        aria-expanded={open}
        aria-controls="shalom-mobile-nav"
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open ? (
        <nav
          id="shalom-mobile-nav"
          className="absolute left-0 right-0 top-full z-50 border-b border-[color:var(--shalom-border)] bg-[color:var(--shalom-surface)] px-5 py-4 shadow-lg"
        >
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--shalom-text)] hover:bg-[color:var(--shalom-accent-soft)] hover:text-[color:var(--shalom-accent-hover)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
