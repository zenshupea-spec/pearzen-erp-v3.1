'use client';

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
  getOmSiteAllocationData,
  saveOmSiteSlotAssignments,
} from '../actions/allocation';
import { COMMAND_CENTER_REFRESH_MS } from '../lib/command-center-tabs';
import type { OmSiteAllocationPayload } from '../lib/field-operations-types';

type OmFieldDataContextValue = OmSiteAllocationPayload & {
  loading: boolean;
  refresh: () => Promise<void>;
  saveSiteAssignments: (input: {
    siteId: string;
    siteName: string;
    slotAssignments: Record<string, string>;
    slots: { slotId: string; currentEmpNo: string | null }[];
    changeReason?: string;
  }) => Promise<{ success: boolean; error?: string }>;
};

const EMPTY: OmSiteAllocationPayload = {
  guardPool: [],
  unassignedSites: [],
  allocatedSites: [],
  tacticalShorts: [],
  nearbyGuardBench: [],
  guardRoster: [],
  isDemo: false,
};

const OmFieldDataContext = createContext<OmFieldDataContextValue | null>(null);

export function OmFieldDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<OmSiteAllocationPayload>(EMPTY);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getOmSiteAllocationData();
      setPayload(data);
    } catch {
      setPayload({ ...EMPTY, error: 'Failed to load MNR roster and sites.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(false);
    const intervalId = window.setInterval(() => {
      void refresh(true);
    }, COMMAND_CENTER_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  const saveSiteAssignments = useCallback(
    async (input: {
      siteId: string;
      siteName: string;
      slotAssignments: Record<string, string>;
      slots: { slotId: string; currentEmpNo: string | null }[];
      changeReason?: string;
    }) => {
      const assignments = input.slots
        .map((slot) => {
          const empNo = input.slotAssignments[slot.slotId]?.trim() || '';
          if (!empNo && !slot.currentEmpNo) return null;
          if (empNo === (slot.currentEmpNo ?? '')) return null;
          return {
            empNo,
            previousEmpNo: slot.currentEmpNo,
          };
        })
        .filter((row): row is { empNo: string; previousEmpNo: string | null } => {
          if (!row) return false;
          return Boolean(row.empNo);
        });

      if (!assignments.length) {
        return { success: true };
      }

      const result = await saveOmSiteSlotAssignments({
        siteId: input.siteId,
        siteName: input.siteName,
        assignments,
        changeReason: input.changeReason,
      });

      if (result.success) {
        await refresh();
        return { success: true };
      }
      return { success: false, error: result.error };
    },
    [refresh],
  );

  const value = useMemo<OmFieldDataContextValue>(
    () => ({
      ...payload,
      loading,
      refresh,
      saveSiteAssignments,
    }),
    [payload, loading, refresh, saveSiteAssignments],
  );

  return (
    <OmFieldDataContext.Provider value={value}>{children}</OmFieldDataContext.Provider>
  );
}

export function useOmFieldData(): OmFieldDataContextValue {
  const ctx = useContext(OmFieldDataContext);
  if (!ctx) {
    throw new Error('useOmFieldData must be used within OmFieldDataProvider');
  }
  return ctx;
}
