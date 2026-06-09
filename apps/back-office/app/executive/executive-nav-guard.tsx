'use client';

import {
  createContext,
  useContext,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';

export type ExecutiveNavGuard = {
  shouldBlock: (href: string) => boolean;
  onBlocked: (href: string) => void;
};

const ExecutiveNavGuardContext =
  createContext<MutableRefObject<ExecutiveNavGuard | null> | null>(null);

export function ExecutiveNavGuardProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<ExecutiveNavGuard | null>(null);
  return (
    <ExecutiveNavGuardContext.Provider value={guardRef}>
      {children}
    </ExecutiveNavGuardContext.Provider>
  );
}

export function useExecutiveNavGuardRef() {
  const ctx = useContext(ExecutiveNavGuardContext);
  if (!ctx) {
    throw new Error('useExecutiveNavGuardRef must be used within ExecutiveNavGuardProvider');
  }
  return ctx;
}

export function tryExecutiveNavGuard(
  guardRef: MutableRefObject<ExecutiveNavGuard | null>,
  href: string,
): boolean {
  const guard = guardRef.current;
  if (!guard?.shouldBlock(href)) return true;
  guard.onBlocked(href);
  return false;
}
