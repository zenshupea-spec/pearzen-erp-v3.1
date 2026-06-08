'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ExecutiveGlassCard } from '../../../../components/executive/ExecutiveVaultShell';
import {
  fetchExecutiveSessionProfile,
  type ExecutiveSessionProfile,
} from '../../actions';
import { getCafeDashboard } from '../actions';
import { CafePortalShell } from '../CafePortalShell';
import { normalizeIngredient } from '../cafe-ingredient-utils';
import { ExpiryTrackingPanel } from '../cafe-ingredients-panels';
import { isCafeHubView } from '../../../../lib/hq-hub';

export default function CafeExpiryPage() {
  const searchParams = useSearchParams();
  const fromHub = searchParams.get('hub') === '1';
  const [sessionProfile, setSessionProfile] = useState<ExecutiveSessionProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState<ReturnType<typeof normalizeIngredient>[]>([]);

  const hubView = isCafeHubView(sessionProfile?.rank, fromHub);

  useEffect(() => {
    fetchExecutiveSessionProfile().then(setSessionProfile);
  }, []);

  useEffect(() => {
    void getCafeDashboard().then((payload) => {
      if (payload.error) setLoadError(payload.error);
      setIngredients((payload.ingredients ?? []).map((ing) => normalizeIngredient(ing)));
      setLoading(false);
    });
  }, []);

  return (
    <CafePortalShell hubView={hubView} subtitle="Expiry tracking · stock lots closest to expire first">
      {loadError ? (
        <ExecutiveGlassCard className="border-rose-200/80 bg-rose-50/50 p-4">
          <p className="text-sm font-bold text-rose-900">Could not load live café data</p>
          <p className="mt-1 text-xs text-rose-700">{loadError}</p>
        </ExecutiveGlassCard>
      ) : null}

      {loading ? (
        <ExecutiveGlassCard className="p-8 text-center text-sm text-slate-500">
          Loading expiry tracker…
        </ExecutiveGlassCard>
      ) : (
        <ExpiryTrackingPanel ingredients={ingredients} />
      )}
    </CafePortalShell>
  );
}
