import type { ReactNode } from 'react';

import { enforceExecutivePortalGate } from '../../lib/executive-portal-server-gate';
import { loadExecutiveBrandTokens } from '../../lib/cvs-brand-tokens-server';

import { fetchExecutiveSessionProfile } from './actions';
import ExecutiveLayoutClient from './ExecutiveLayoutClient';

export default async function ExecutiveLayout({
  children,
}: {
  children: ReactNode;
}) {
  await enforceExecutivePortalGate();
  const [sessionProfile, brandTokens] = await Promise.all([
    fetchExecutiveSessionProfile(),
    loadExecutiveBrandTokens(),
  ]);
  return (
    <ExecutiveLayoutClient
      initialSessionProfile={sessionProfile}
      initialBrandTokens={brandTokens}
    >
      {children}
    </ExecutiveLayoutClient>
  );
}
