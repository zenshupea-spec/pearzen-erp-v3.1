'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { ShalomPublicWebsiteLayoutData } from '../../app/shalom-public/actions';

const ShalomPublicWebsiteContext = createContext<ShalomPublicWebsiteLayoutData | null>(null);

export function ShalomPublicWebsiteProvider({
  children,
  ...value
}: ShalomPublicWebsiteLayoutData & { children: ReactNode }) {
  return (
    <ShalomPublicWebsiteContext.Provider value={value}>{children}</ShalomPublicWebsiteContext.Provider>
  );
}

export function useShalomPublicWebsite() {
  const ctx = useContext(ShalomPublicWebsiteContext);
  if (!ctx) {
    throw new Error('useShalomPublicWebsite must be used within ShalomPublicWebsiteProvider');
  }
  return ctx;
}
