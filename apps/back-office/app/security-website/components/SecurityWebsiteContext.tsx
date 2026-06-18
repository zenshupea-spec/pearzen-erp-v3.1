'use client';

import { useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  getSecurityWebsiteUi,
  persistCareersLocale,
  persistSecurityWebsiteLocale,
  readInitialCareersLocale,
  readStoredSecurityWebsiteLocale,
  resolveSecurityWebsiteLocale,
  type SecurityWebsiteLocale,
  type SecurityWebsiteUiStrings,
} from '../../../lib/security-website-i18n';
import type { RankPayEntry } from '../../../../../packages/rank-pay-matrix';
import type { SecurityWebsiteContent } from '../../../lib/security-website-types';

type SecurityWebsiteContextValue = {
  content: SecurityWebsiteContent;
  canEdit: boolean;
  guardRanks: RankPayEntry[];
  quoteRecipientEmails: string[];
  /** Site chrome (header nav, footer, non-careers pages). */
  locale: SecurityWebsiteLocale;
  setLocale: (locale: SecurityWebsiteLocale) => void;
  ui: SecurityWebsiteUiStrings;
  /** Careers page content only — independent of header language. */
  careersLocale: SecurityWebsiteLocale;
  setCareersLocale: (locale: SecurityWebsiteLocale) => void;
  careersUi: SecurityWebsiteUiStrings;
};

const SecurityWebsiteContext = createContext<SecurityWebsiteContextValue | null>(null);

export function SecurityWebsiteProvider({
  content,
  canEdit,
  guardRanks,
  quoteRecipientEmails,
  initialLocale,
  children,
}: {
  content: SecurityWebsiteContent;
  canEdit: boolean;
  guardRanks: RankPayEntry[];
  quoteRecipientEmails: string[];
  initialLocale?: SecurityWebsiteLocale;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const urlLocale = searchParams.get('lang');
  const [locale, setLocaleState] = useState<SecurityWebsiteLocale>(initialLocale ?? 'en');
  const [careersLocale, setCareersLocaleState] = useState<SecurityWebsiteLocale>(
    () => readInitialCareersLocale(),
  );

  useEffect(() => {
    const storedLocale = readStoredSecurityWebsiteLocale();
    const resolved = resolveSecurityWebsiteLocale({
      urlLocale,
      storedLocale,
      fallbackLocale: 'en',
    });
    setLocaleState(resolved);
    if (!storedLocale || urlLocale) {
      persistSecurityWebsiteLocale(resolved);
    }
  }, [urlLocale]);

  const setLocale = useCallback((next: SecurityWebsiteLocale) => {
    setLocaleState(next);
    persistSecurityWebsiteLocale(next);
  }, []);

  const setCareersLocale = useCallback((next: SecurityWebsiteLocale) => {
    setCareersLocaleState(next);
    persistCareersLocale(next);
  }, []);

  const value = useMemo(
    () => ({
      content,
      canEdit,
      guardRanks,
      quoteRecipientEmails,
      locale,
      setLocale,
      ui: getSecurityWebsiteUi(locale),
      careersLocale,
      setCareersLocale,
      careersUi: getSecurityWebsiteUi(careersLocale),
    }),
    [
      content,
      canEdit,
      guardRanks,
      quoteRecipientEmails,
      locale,
      setLocale,
      careersLocale,
      setCareersLocale,
    ],
  );

  return (
    <SecurityWebsiteContext.Provider value={value}>
      {children}
    </SecurityWebsiteContext.Provider>
  );
}

export function useSecurityWebsite() {
  const ctx = useContext(SecurityWebsiteContext);
  if (!ctx) throw new Error('useSecurityWebsite must be used within SecurityWebsiteProvider');
  return ctx;
}

export function useSecurityWebsiteLocaleFromSearch(
  searchLocale: string | undefined,
): SecurityWebsiteLocale {
  return resolveSecurityWebsiteLocale({ urlLocale: searchLocale });
}
