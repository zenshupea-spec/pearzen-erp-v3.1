'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { headOfficePasswordExpiryBannerMessage } from '../../lib/portal-password-expiry-banner';
import type { HeadOfficePasswordExpiryContext } from '../../lib/head-office-portal-password-expiry';

export default function PortalPasswordExpiryBanner({
  expiry,
  changePasswordHref = '/account/change-password',
}: {
  expiry: HeadOfficePasswordExpiryContext;
  changePasswordHref?: string;
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-[190] border-b border-amber-300 bg-amber-50/95 px-4 py-2.5 shadow-sm backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 text-center sm:justify-between sm:text-left">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {headOfficePasswordExpiryBannerMessage(expiry.daysUntilExpiry)}
        </p>
        <Link
          href={changePasswordHref}
          className="inline-flex shrink-0 items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-white transition hover:bg-amber-700"
        >
          Change password
        </Link>
      </div>
    </div>
  );
}
