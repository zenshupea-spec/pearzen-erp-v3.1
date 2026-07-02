'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LABELS: Record<string, string> = {
  forge: 'Forge',
  clients: 'Client hub',
  templates: 'Templates',
  partners: 'Partners',
  payouts: 'Payout audit',
  assist: 'Assist grants',
  commerce: 'Commerce',
  catalog: 'Catalog',
  pricing: 'Pricing',
  purchases: 'Purchases',
  invoices: 'Invoices',
  billing: 'Platform billing',
  health: 'Platform health',
  tenants: 'Tenants',
  settings: 'Access control',
  inbox: 'Contact inbox',
  superapp: 'PEARS',
  exports: 'Store exports',
  companies: 'Companies',
  new: 'New',
  modules: 'Modules',
};

function labelForSegment(segment: string, index: number, parts: string[]): string {
  if (segment in LABELS) return LABELS[segment];
  if (index === parts.length - 1 && segment.length >= 8) return 'Detail';
  return segment.replace(/-/g, ' ');
}

export default function ForgeBreadcrumbs() {
  const pathname = usePathname();
  if (!pathname || pathname === '/forge') return null;

  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'forge') return null;

  const crumbs = parts.map((segment, index) => {
    const href = `/${parts.slice(0, index + 1).join('/')}`;
    const isLast = index === parts.length - 1;
    return {
      href,
      label: labelForSegment(segment, index, parts),
      isLast,
    };
  });

  return (
    <nav
      aria-label="Breadcrumb"
      className="border-b border-slate-200/80 bg-white/60 px-4 py-2 md:px-8"
    >
      <ol className="mx-auto flex max-w-7xl flex-wrap items-center gap-1.5 text-xs text-slate-500">
        {crumbs.map((crumb, index) => (
          <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
            {index > 0 ? (
              <span className="text-slate-300" aria-hidden>
                /
              </span>
            ) : null}
            {crumb.isLast ? (
              <span className="truncate font-semibold text-slate-800">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="truncate transition-colors hover:text-violet-700">
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
