'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ExecutiveGlassCard } from '../../../../components/executive/ExecutiveVaultShell';
import { ExecutivePageLoading } from '../../../../components/executive/ExecutivePageChrome';
import {
  fetchExecutiveSessionProfile,
  type ExecutiveSessionProfile,
} from '../../actions';
import { getCafeCustomers, getCafeDashboard, type CafeCustomerRow } from '../actions';
import { CafePortalShell } from '../CafePortalShell';
import { CafeCustomersPanel } from '../cafe-customers-panel';
import { isCafeHubView } from '../../../../lib/hq-hub';
import { useCafeBranchScope } from '../use-cafe-branch';

export default function CafeCustomersPage() {
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
  const [customers, setCustomers] = useState<CafeCustomerRow[]>([]);

  const hubView = isCafeHubView(sessionProfile?.rank, fromHub);

  useEffect(() => {
    fetchExecutiveSessionProfile().then(setSessionProfile);
  }, []);

  useEffect(() => {
    if (!locationId) return;
    setLoading(true);
    void Promise.all([getCafeDashboard(locationId), getCafeCustomers()]).then(
      ([dashboard, customersPayload]) => {
        if (dashboard.error || customersPayload.error) {
          setLoadError(dashboard.error ?? customersPayload.error ?? null);
        }
        setLocationName(dashboard.locationName ?? null);
        setCustomers(customersPayload.customers);
        setLoading(false);
      },
    );
  }, [locationId, setLocationName]);

  return (
    <CafePortalShell
      hubView={hubView}
      subtitle="Customer registry · spend history and loyalty discounts"
      branches={branches}
      selectedBranchId={locationId}
      onBranchChange={handleBranchChange}
      showBranchSelector={!hubView}
      locationName={locationName}
    >
      {loading ? (
        <ExecutivePageLoading message="Loading customer registry…" />
      ) : (
        <CafeCustomersPanel initialCustomers={customers} loadError={loadError} />
      )}
    </CafePortalShell>
  );
}
