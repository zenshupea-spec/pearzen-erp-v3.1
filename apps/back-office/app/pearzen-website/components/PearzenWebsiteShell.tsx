'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import PearzenLogoWordmark from './PearzenLogoWordmark';
import { PearzenWebsiteEditBar, PearzenWebsiteEditProvider } from './PearzenWebsiteEditProvider';
import { usePearzenWebsite } from './PearzenWebsiteContext';

const NAV = [
  { href: '/pearzen-website#platform', label: 'Engineering' },
  { href: '/pearzen-website#contact', label: 'Contact' },
];

function PearzenWebsiteShellInner({ children }: { children: ReactNode }) {
  const { content, canEdit } = usePearzenWebsite();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  return (
    <div className="pearzen-website min-h-screen bg-[var(--pearzen-bg)] text-slate-800">
      <PearzenWebsiteEditBar />
      <header
        className={`pearzen-site-header sticky z-50 ${
          canEdit ? 'top-[49px]' : 'top-0'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 md:px-8">
          <Link href="/pearzen-website" className="flex shrink-0 items-center">
            {content.logoUrl ? (
              <PearzenLogoWordmark
                src={content.logoUrl}
                alt={content.companyName}
                className="h-8 w-auto max-w-[155px] md:h-9 md:max-w-[175px]"
                priority
              />
            ) : (
              <span className="text-sm font-black uppercase tracking-tight text-[var(--pearzen-navy-deep)]">
                {content.companyName}
              </span>
            )}
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-10 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="pearzen-nav-link relative text-sm font-semibold after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:transition-all hover:after:w-full"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <a
            href={`mailto:${content.contactEmail}`}
            className="pearzen-btn-primary hidden rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider md:inline-flex"
          >
            Get in touch
          </a>

          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white p-2 text-[var(--pearzen-navy-deep)] shadow-sm md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="border-t border-slate-200/80 bg-white px-4 py-4 shadow-inner md:hidden">
            <nav className="flex flex-col gap-3">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-semibold text-slate-600 hover:text-[var(--pearzen-navy-deep)]"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <a
                href={`mailto:${content.contactEmail}`}
                className="pearzen-btn-primary mt-2 inline-flex justify-center rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider"
              >
                Get in touch
              </a>
            </nav>
          </div>
        ) : null}
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="pearzen-site-footer relative z-20 text-slate-600">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 md:flex-row md:items-start md:justify-between md:px-8">
          <div>
            {content.logoUrl ? (
              <PearzenLogoWordmark
                src={content.logoUrl}
                alt={content.companyName}
                className="h-10 w-auto max-w-[200px] md:h-11 md:max-w-[220px]"
              />
            ) : (
              <p className="text-sm font-black uppercase tracking-tight text-[var(--pearzen-navy-deep)]">
                {content.companyName}
              </p>
            )}
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500">
              Engineered by Pearzen.
            </p>
          </div>
          <div className="text-sm">
            <a
              href={`mailto:${content.contactEmail}`}
              className="font-medium text-[var(--pearzen-navy)] transition-colors hover:text-[var(--pearzen-cyan)]"
            >
              {content.contactEmail}
            </a>
            <p className="mt-2 text-xs text-slate-400">
              © {new Date().getFullYear()} {content.companyName}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function PearzenWebsiteShell({ children }: { children: ReactNode }) {
  return (
    <PearzenWebsiteEditProvider>
      <PearzenWebsiteShellInner>{children}</PearzenWebsiteShellInner>
    </PearzenWebsiteEditProvider>
  );
}
