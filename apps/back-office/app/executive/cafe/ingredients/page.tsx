'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ExecutiveGlassCard } from '../../../../components/executive/ExecutiveVaultShell';
import {
  fetchExecutiveSessionProfile,
  type ExecutiveSessionProfile,
} from '../../actions';
import { getCafeDashboard, type CafeDashboardPayload } from '../actions';
import { CafePortalShell } from '../CafePortalShell';
import { normalizeIngredient } from '../cafe-ingredient-utils';
import {
  normalizeMenuItems,
  syncMenuRecipeCosts,
  type CafeMenuRecipeItem,
} from '../cafe-menu-sync';
import { IngredientsLedgerPanel } from '../cafe-ingredients-panels';
import { isCafeHubView } from '../../../../lib/hq-hub';
import { reconcilePrepWithMenu } from '../prep-menu-sync';
import { useCafeBranchScope } from '../use-cafe-branch';
import { useCafeDashboardSave } from '../use-cafe-dashboard-persistence';

const MENU_DEFAULT_CATS = [
  'Hot Beverages',
  'Cold Beverages',
  'Pastries & Bakery',
  'Mains & Sandwiches',
  'Desserts',
];

export default function CafeIngredientsPage() {
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
  const [dashboard, setDashboard] = useState<CafeDashboardPayload | null>(null);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hubView = isCafeHubView(sessionProfile?.rank, fromHub);

  const { markDirty, resetDirty } = useCafeDashboardSave(
    dashboard,
    dashboardReady,
    locationId,
  );

  useEffect(() => {
    fetchExecutiveSessionProfile().then(setSessionProfile);
  }, []);

  useEffect(() => {
    if (!locationId) return;
    setDashboardReady(false);
    resetDirty();
    void getCafeDashboard(locationId).then((payload) => {
      if (payload.error) setLoadError(payload.error);
      setLocationName(payload.locationName ?? null);
      const loadedIngredients = (payload.ingredients ?? []).map((ing) =>
        normalizeIngredient(ing),
      );
      const loadedMenu = syncMenuRecipeCosts(
        normalizeMenuItems(payload.menuItems ?? []),
        loadedIngredients,
      );
      const linkedPrep = reconcilePrepWithMenu(
        loadedMenu,
        payload.prepItems ?? [],
        payload.displayItems ?? [],
      );
      setDashboard({
        ...payload,
        ingredients: loadedIngredients,
        menuItems: loadedMenu,
        menuCategories: payload.menuCategories?.length ? payload.menuCategories : MENU_DEFAULT_CATS,
        prepItems: linkedPrep.prepItems,
        displayItems: linkedPrep.displayItems,
      });
      setDashboardReady(true);
      resetDirty();
    });
  }, [locationId, resetDirty, setLocationName]);

  const mutateDashboard = useCallback(
    (
      updater: (prev: CafeDashboardPayload) => CafeDashboardPayload,
      immediate = false,
    ) => {
      setDashboard((prev) => {
        if (!prev) return prev;
        return updater(prev);
      });
      markDirty(immediate);
    },
    [markDirty],
  );

  const ingredients = (dashboard?.ingredients ?? []).map((ing) => normalizeIngredient(ing));
  const menuItems = (dashboard?.menuItems ?? []) as CafeMenuRecipeItem[];

  const setIngredients: React.Dispatch<React.SetStateAction<typeof ingredients>> = (updater) => {
    mutateDashboard((prev) => {
      const current = prev.ingredients.map((ing) => normalizeIngredient(ing));
      const nextIngredients = typeof updater === 'function' ? updater(current) : updater;
      const syncedMenu = syncMenuRecipeCosts(prev.menuItems as CafeMenuRecipeItem[], nextIngredients);
      return {
        ...prev,
        ingredients: nextIngredients,
        menuItems: syncedMenu,
      };
    }, true);
  };

  const setMenuItems: React.Dispatch<React.SetStateAction<CafeMenuRecipeItem[]>> = (updater) => {
    mutateDashboard((prev) => {
      const currentMenu = prev.menuItems as CafeMenuRecipeItem[];
      const nextMenu = typeof updater === 'function' ? updater(currentMenu) : updater;
      const normalizedIngredients = prev.ingredients.map((ing) => normalizeIngredient(ing));
      return {
        ...prev,
        menuItems: syncMenuRecipeCosts(nextMenu, normalizedIngredients),
      };
    }, true);
  };

  return (
    <CafePortalShell
      hubView={hubView}
      subtitle="Ingredients ledger · procurement inputs"
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

      {!dashboardReady ? (
        <ExecutiveGlassCard className="p-8 text-center text-sm text-slate-500">
          Loading ingredients ledger…
        </ExecutiveGlassCard>
      ) : (
        <IngredientsLedgerPanel
          ingredients={ingredients}
          setIngredients={setIngredients}
          menuItems={menuItems}
          setMenuItems={setMenuItems}
        />
      )}
    </CafePortalShell>
  );
}
