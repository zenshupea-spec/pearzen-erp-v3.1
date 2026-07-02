'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Coffee,
  FlaskConical,
  Package,
  Tag,
  Users,
  Wallet,
} from 'lucide-react';
import type { CafeBranch } from './actions';
import { HQ_HUB_PATH } from '../../../lib/hq-hub';
import {
  EXECUTIVE_PAGE_X,
  ExecutivePageBody,
  ExecutivePageHeader,
  ExecutivePageLiveSubtitle,
  ExecutivePageShell,
  ExecutivePageToolbar,
} from '../../../components/executive/ExecutivePageChrome';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
import {
  CAFE_COMPLIANCE_PATH,
  CAFE_CUSTOMERS_PATH,
  CAFE_EXPIRY_PATH,
  CAFE_FLOAT_PATH,
  CAFE_INGREDIENTS_PATH,
  CAFE_INVENTORY_PATH,
  CAFE_MENU_PATH,
  CAFE_PORTAL_TABS,
  cafeComplianceSectionHref,
  cafePortalHref,
} from './cafe-portal-nav';

const TAB_ICONS = {
  [CAFE_COMPLIANCE_PATH]: Coffee,
  [CAFE_FLOAT_PATH]: Wallet,
  [CAFE_INVENTORY_PATH]: FlaskConical,
  [CAFE_INGREDIENTS_PATH]: Package,
  [CAFE_EXPIRY_PATH]: CalendarDays,
  [CAFE_MENU_PATH]: Tag,
  [CAFE_CUSTOMERS_PATH]: Users,
} as const;

export function CafePortalShell({
  hubView,
  subtitle,
  children,
  branches = [],
  selectedBranchId,
  onBranchChange,
  showBranchSelector = false,
  locationName,
}: {
  hubView: boolean;
  subtitle: string;
  children: React.ReactNode;
  branches?: CafeBranch[];
  selectedBranchId?: string | null;
  onBranchChange?: (branchId: string) => void;
  showBranchSelector?: boolean;
  locationName?: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hash, setHash] = useState('');
  const fromHub = searchParams.get('hub') === '1';
  const hubNav = fromHub || hubView;
  const branchId = selectedBranchId ?? searchParams.get('branch');
  const showBranches = showBranchSelector && branches.length > 1;

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash.replace('#', ''));
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [pathname]);

  return (
    <ExecutivePageShell>
      {hubNav ? (
        <div className={`pt-4 ${EXECUTIVE_PAGE_X}`}>
          <Link
            href={HQ_HUB_PATH}
            className="inline-flex max-w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 sm:text-xs"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Return to HQ Hub</span>
          </Link>
        </div>
      ) : null}

      <ExecutivePageHeader
        title={locationName ?? 'Café Tasha'}
        subtitle={<ExecutivePageLiveSubtitle>{subtitle}</ExecutivePageLiveSubtitle>}
        actions={
          showBranches ? (
            <label className="flex min-w-[12rem] flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Branch
              </span>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <select
                  value={branchId ?? branches[0]?.id ?? ''}
                  onChange={(event) => onBranchChange?.(event.target.value)}
                  className={`w-full appearance-none rounded-xl border border-slate-200/80 bg-white/90 py-2 pl-9 pr-8 text-sm font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 ${CVS_BRAND_CLASSES.focusRing}`}
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          ) : undefined
        }
      />

      <ExecutivePageToolbar>
        {CAFE_PORTAL_TABS.map((tab) => {
          const complianceAnchor =
            'complianceAnchor' in tab ? tab.complianceAnchor : undefined;
          const linkHref = complianceAnchor
            ? cafeComplianceSectionHref(complianceAnchor, hubNav, branchId)
            : cafePortalHref(tab.href, hubNav, branchId);
          const active =
            pathname === tab.href
            || (complianceAnchor != null
              && pathname === CAFE_COMPLIANCE_PATH
              && hash === complianceAnchor);
          const Icon = TAB_ICONS[tab.href];
          return (
            <Link
              key={tab.href}
              href={linkHref}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                active
                  ? `${CVS_BRAND_CLASSES.mobileTabActive} border-transparent`
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
            </Link>
          );
        })}
      </ExecutivePageToolbar>

      <ExecutivePageBody>{children}</ExecutivePageBody>
    </ExecutivePageShell>
  );
}
