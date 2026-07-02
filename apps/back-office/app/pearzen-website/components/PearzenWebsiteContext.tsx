'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { PearzenWebsiteContent } from '../../lib/pearzen-website-types';

type PearzenWebsiteContextValue = {
  content: PearzenWebsiteContent;
  canEdit: boolean;
};

const PearzenWebsiteContext = createContext<PearzenWebsiteContextValue | null>(null);

export function PearzenWebsiteProvider({
  content,
  canEdit,
  children,
}: PearzenWebsiteContextValue & { children: ReactNode }) {
  return (
    <PearzenWebsiteContext.Provider value={{ content, canEdit }}>
      {children}
    </PearzenWebsiteContext.Provider>
  );
}

export function usePearzenWebsite() {
  const ctx = useContext(PearzenWebsiteContext);
  if (!ctx) throw new Error('usePearzenWebsite must be used within PearzenWebsiteProvider');
  return ctx;
}
