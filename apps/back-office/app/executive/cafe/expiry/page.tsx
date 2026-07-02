'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ExecutiveGlassCard } from '../../../../components/executive/ExecutiveVaultShell';
import { ExecutivePageLoading } from '../../../../components/executive/ExecutivePageChrome';
import {
  fetchExecutiveSessionProfile,
  type ExecutiveSessionProfile,
} from '../../actions';
import { getCafeDashboard } from '../actions';
import { CafePortalShell } from '../CafePortalShell';
import { normalizeIngredient } from '../cafe-ingredient-utils';
import { ExpiryTrackingPanel } from '../cafe-ingredients-panels';
import { isCafeHubView } from '../../../../lib/hq-hub';
import { useCafeBranchScope } from '../use-cafe-branch';

export default function CafeExpiryPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromHub = searchParams.get('hub') === '1';
  const {
    branches,
    locationId,
    locationName,
    setLocationName,
    handleBranchChange,
  } = useCafeBranchScope(pathname);
  const [sessionProfile, setSessionProfile] = useState<ExecutiveSessionProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState<ReturnType<typeof normalizeIngredient>[]>([]);

  const hubView = isCafeHubView(sessionProfile?.rank, fromHub);

  useEffect(() => {
    fetchExecutiveSessionProfile().then(setSessionProfile);
  }, []);

  useEffect(() => {
    if (!locationId) return;
    setLoading(true);
    void getCafeDashboard(locationId).then((payload) => {
      if (payload.error) setLoadError(payload.error);
      setLocationName(payload.locationName ?? null);
      setIngredients((payload.ingredients ?? []).map((ing) => normalizeIngredient(ing)));
      setLoading(false);
    });
  }, [locationId, setLocationName]);

  return (
    <CafePortalShell
      hubView={hubView}
      subtitle="Expiry tracking · stock lots closest to expire first"
      branches={branches}
      selectedBranchId={locationId}
      onBranchChange={handleBranchChange}
      showBranchSelector={!hubView}
      locationName={locationName}
    >
      {loadError ? (
        <ExecutiveGlassCard className="border-rose-200/80 bg-rose-50/50 p-4">
          <p className="text-sm font-bold text-rose-900">Could not load live café data</p>
          <p className="mt-1 text-xs text-rose-700">{loadError}</p>
        </ExecutiveGlassCard>
      ) : null}

      {loading ? (
        <ExecutivePageLoading message="Loading expiry tracking…" />
      ) : (
        <ExpiryTrackingPanel ingredients={ingredients} />
      )}
    </CafePortalShell>
  );
}
