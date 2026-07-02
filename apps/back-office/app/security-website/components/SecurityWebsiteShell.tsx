'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, LayoutDashboard, Mail, MapPin, Menu, Phone, Shield, X } from 'lucide-react';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

import { SECURITY_WEBSITE_LOCALES, LOCALE_LABELS } from '../../../lib/security-website-i18n';
import { useSecurityWebsite } from './SecurityWebsiteContext';
import {
  SecurityWebsiteEditBar,
  SecurityWebsiteEditProvider,
} from './SecurityWebsiteEditProvider';

type NavItem = {
  href: string;
  labelKey: 'navHome' | 'navSolutions' | 'navCompliance' | 'navPricing' | 'navContact';
  exact?: boolean;
};

const PRIMARY_NAV: NavItem[] = [
  { href: '/security-website', labelKey: 'navHome', exact: true },
  { href: '/security-website/offerings', labelKey: 'navSolutions' },
  { href: '/security-website/compliance', labelKey: 'navCompliance' },
  { href: '/security-website/pricing', labelKey: 'navPricing' },
  { href: '/security-website/contact', labelKey: 'navContact' },
];

function splitHashHref(href: string): { path: string; hash: string | null } {
  const hashIndex = href.indexOf('#');
  if (hashIndex === -1) return { path: href, hash: null };
  return {
    path: href.slice(0, hashIndex),
    hash: href.slice(hashIndex),
  };
}

function scrollToHash(hash: string, behavior: ScrollBehavior = 'smooth') {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  if (!id) return false;
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView({ behavior, block: 'start' });
  return true;
}

function isNavActive(pathname: string, item: NavItem) {
  if (item.href === '/security-website/offerings') {
    return (
      pathname.startsWith('/security-website/offerings') ||
      pathname.startsWith('/security-website/solutions') ||
      pathname.startsWith('/security-website/technology') ||
      pathname.startsWith('/security-website/services') ||
      pathname.startsWith('/security-website/industries')
    );
  }
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function NavLink({
  item,
  pathname,
  locationHash,
  ui,
  onNavigate,
  onHashChange,
  className = '',
}: {
  item: NavItem;
  pathname: string;
  locationHash: string;
  ui: ReturnType<typeof useSecurityWebsite>['ui'];
  onNavigate?: () => void;
  onHashChange?: (hash: string) => void;
  className?: string;
}) {
  const active = isNavActive(pathname, item);
  const { path, hash } = splitHashHref(item.href);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (hash && pathname === path) {
      event.preventDefault();
      scrollToHash(hash);
      window.history.replaceState(null, '', `${path}${hash}`);
      onHashChange?.(hash);
    }
    onNavigate?.();
  };

  return (
    <Link
      href={item.href}
      onClick={handleClick}
      scroll={hash ? false : undefined}
      className={`text-sm transition-colors ${
        active ? 'font-medium text-red-800' : 'text-slate-600 hover:text-red-800'
      } ${className}`}
    >
      {ui[item.labelKey]}
    </Link>
  );
}

export default function SecurityWebsiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { content, ui, locale, setLocale } = useSecurityWebsite();
  const isCareers = pathname.startsWith('/security-website/careers');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [locationHash, setLocationHash] = useState('');

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const syncHash = () => setLocationHash(window.location.hash);
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [pathname]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const scroll = () => {
      if (scrollToHash(hash, 'auto')) {
        setLocationHash(hash);
      }
    };

    scroll();
    const timer = window.setTimeout(scroll, 50);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <SecurityWebsiteEditProvider>
    <div className="security-website min-h-screen overflow-x-hidden bg-white text-slate-900 md:overflow-x-visible">
      <SecurityWebsiteEditBar />

      <div className="bg-red-700 py-1.5 text-center text-[11px] font-medium italic text-white max-md:px-3 max-md:text-[10px] max-md:leading-snug">
        {content.tagline}
      </div>
      <div className="cv-checker" aria-hidden />

      <header className="sticky top-0 z-40 border-b border-red-100/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 md:px-6 max-md:gap-2 max-md:px-3 max-md:py-2.5">
          <Link
            href="/security-website"
            className="flex min-w-0 shrink-0 items-center gap-2.5 max-md:min-w-0 max-md:flex-1"
          >
            {content.logoUrl ? (
              <Image
                src={content.logoUrl}
                alt={content.companyName}
                width={140}
                height={56}
                className="h-12 w-auto shrink-0 object-contain sm:h-14 max-md:h-9"
                sizes="140px"
                priority
                unoptimized={
                  content.logoUrl.startsWith('data:') || content.logoUrl.includes('supabase')
                }
              />
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-700 text-white max-md:h-9 max-md:w-9">
                  <Shield className="h-5 w-5 max-md:h-4 max-md:w-4" />
                </div>
              </div>
            )}
            <div className="hidden min-w-0 md:block">
              <p className="font-university-roman text-sm leading-snug text-red-800">
                {content.companyName}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-red-600/90">
                Established 7 March 2006
              </p>
            </div>
            <div className="min-w-0 md:hidden">
              <p className="truncate font-university-roman text-xs leading-snug text-red-800">
                {content.companyName}
              </p>
            </div>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-7 lg:flex">
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                locationHash={locationHash}
                ui={ui}
                onHashChange={setLocationHash}
              />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/clientlogin"
              className="hidden h-9 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-800 transition hover:border-red-300 hover:bg-red-100 sm:inline-flex max-md:hidden"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              {ui.navClientPortal}
            </Link>
            <div className="relative max-md:hidden">
              <select
                value={locale}
                onChange={(e) =>
                  setLocale(e.target.value as (typeof SECURITY_WEBSITE_LOCALES)[number])
                }
                className="h-9 appearance-none rounded-full border border-slate-200 bg-white py-0 pl-2.5 pr-7 text-xs font-medium text-slate-600"
                aria-label="Language"
              >
                {SECURITY_WEBSITE_LOCALES.map((loc) => (
                  <option key={loc} value={loc}>
                    {LOCALE_LABELS[loc]}
                  </option>
                ))}
              </select>
              <Globe className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
            {!isCareers ? (
              <Link
                href="/security-website/careers"
                className="cv-btn-primary hidden h-9 items-center rounded-full px-4 text-xs font-semibold sm:inline-flex max-md:hidden"
              >
                {ui.ctaCareers}
              </Link>
            ) : null}
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 lg:hidden"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-red-50 px-4 py-4 lg:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col gap-1">
              {PRIMARY_NAV.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  locationHash={locationHash}
                  ui={ui}
                  onHashChange={setLocationHash}
                  onNavigate={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 hover:bg-red-50 max-md:py-3 max-md:text-base"
                />
              ))}

              <div className="mt-3 border-t border-slate-100 pt-3 md:hidden">
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Language
                </p>
                <div className="grid grid-cols-3 gap-2 px-1">
                  {SECURITY_WEBSITE_LOCALES.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => {
                        setLocale(loc);
                        setMobileOpen(false);
                      }}
                      className={`rounded-lg border px-2 py-2.5 text-xs font-semibold transition ${
                        locale === loc
                          ? 'border-red-300 bg-red-50 text-red-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-red-200'
                      }`}
                    >
                      {LOCALE_LABELS[loc]}
                    </button>
                  ))}
                </div>
              </div>

              <Link
                href="/clientlogin"
                onClick={() => setMobileOpen(false)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-100 md:hidden"
              >
                <LayoutDashboard className="h-4 w-4" />
                {ui.navClientPortal}
              </Link>
              {!isCareers ? (
                <Link
                  href="/security-website/careers"
                  onClick={() => setMobileOpen(false)}
                  className="cv-btn-primary mt-4 inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold md:hidden"
                >
                  {ui.ctaCareers}
                </Link>
              ) : null}
            </nav>
          </div>
        ) : null}
      </header>

      <main>{children}</main>

      <footer className="cv-footer border-t border-red-900/30 text-slate-300">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center md:px-6">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
            <div>
              <p className="text-sm font-bold text-white">{content.companyName}</p>
              <p className="mt-2 text-sm text-slate-400">{content.footerTagline}</p>
            </div>
            <div className="space-y-2 text-sm max-md:space-y-3">
              <a
                href={`tel:${content.contactPhone.replace(/\s/g, '')}`}
                className="flex items-center justify-center gap-2 hover:text-white max-md:break-all"
              >
                <Phone className="h-4 w-4 text-yellow-400" />
                {content.contactPhone}
              </a>
              <a
                href={`mailto:${content.contactEmail}`}
                className="flex items-center justify-center gap-2 hover:text-white max-md:break-all"
              >
                <Mail className="h-4 w-4 text-yellow-400" />
                {content.contactEmail}
              </a>
              <p className="flex items-center justify-center gap-2 max-md:items-start max-md:text-left">
                <MapPin className="h-4 w-4 text-yellow-400 max-md:mt-0.5 max-md:shrink-0" />
                {content.contactAddress}
              </p>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} {content.companyName}
        </div>
      </footer>
    </div>
    </SecurityWebsiteEditProvider>
  );
}
