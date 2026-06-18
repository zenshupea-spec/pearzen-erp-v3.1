'use client';

import { Globe } from 'lucide-react';

import {
  CAREERS_LOCALE_ORDER,
  LOCALE_LABELS,
  type SecurityWebsiteLocale,
} from '../../../lib/security-website-i18n';
import { useSecurityWebsite } from '../components/SecurityWebsiteContext';

export default function CareersLanguageSwitcher() {
  const { careersLocale, setCareersLocale, careersUi } = useSecurityWebsite();

  return (
    <div className="relative shrink-0">
      <select
        value={careersLocale}
        onChange={(e) => setCareersLocale(e.target.value as SecurityWebsiteLocale)}
        className="h-10 appearance-none rounded-full border border-slate-200 bg-white py-0 pl-3 pr-8 text-sm font-medium text-slate-700 shadow-sm"
        aria-label={careersUi.careersLanguage}
      >
        {CAREERS_LOCALE_ORDER.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_LABELS[loc]}
          </option>
        ))}
      </select>
      <Globe className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
