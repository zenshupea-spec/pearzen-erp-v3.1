'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveCafeDashboard, type CafeDashboardPayload } from './actions';

const AUTOSAVE_MS = 900;
const IMMEDIATE_SAVE_MS = 150;

export type CafeSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Debounced autosave with stale-response guard — skips save until markDirty() is called. */
export function useCafeDashboardSave(
  dashboard: CafeDashboardPayload | null,
  dashboardReady: boolean,
  locationId: string | null,
) {
  const [saveState, setSaveState] = useState<CafeSaveState>('idle');

  const dashboardRef = useRef(dashboard);
  const saveGenerationRef = useRef(0);
  const userEditedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  dashboardRef.current = dashboard;

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const flushSave = useCallback(async () => {
    const payload = dashboardRef.current;
    if (!payload || !dashboardReady || !locationId || !userEditedRef.current) return;

    const generation = ++saveGenerationRef.current;
    setSaveState('saving');

    const result = await saveCafeDashboard({ ...payload, locationId }, locationId);

    if (generation !== saveGenerationRef.current) return;

    setSaveState(result.ok ? 'saved' : 'error');
    if (!result.ok && result.error) {
      console.error('Café dashboard save failed:', result.error);
    }
  }, [dashboardReady, locationId]);

  const markDirty = useCallback(
    (immediate = false) => {
      userEditedRef.current = true;
      if (!dashboardReady || !locationId) return;
      clearSaveTimer();
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void flushSave();
      }, immediate ? IMMEDIATE_SAVE_MS : AUTOSAVE_MS);
    },
    [clearSaveTimer, dashboardReady, flushSave, locationId],
  );

  const resetDirty = useCallback(() => {
    userEditedRef.current = false;
    clearSaveTimer();
    setSaveState('idle');
  }, [clearSaveTimer]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!userEditedRef.current || !dashboardRef.current || !locationId) return;
      clearSaveTimer();
      void flushSave();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [clearSaveTimer, flushSave, locationId]);

  return { saveState, markDirty, resetDirty, flushSave };
}
