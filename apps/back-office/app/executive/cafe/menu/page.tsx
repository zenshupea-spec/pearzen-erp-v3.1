'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ExecutiveGlassCard } from '../../../../components/executive/ExecutiveVaultShell';
import { ExecutivePageLoading } from '../../../../components/executive/ExecutivePageChrome';
import {
  fetchExecutiveSessionProfile,
  type ExecutiveSessionProfile,
} from '../../actions';
import { getCafeDashboard, type CafeDashboardPayload } from '../actions';
import { CafePortalShell } from '../CafePortalShell';
import { normalizeIngredient, type Ingredient } from '../cafe-ingredient-utils';
import { MenuEngineeringDesk } from '../cafe-menu-panels';
import {
  MENU_DEFAULT_CATS,
  normalizeMenuItems,
  syncMenuRecipeCosts,
  type CafeMenuRecipeItem,
} from '../cafe-menu-sync';
import { type MenuDailySaleRecord } from '../cafe-menu-velocity';
import { isCafeHubView } from '../../../../lib/hq-hub';
import { reconcilePrepWithMenu, setMenuKitchenTrack, type KitchenTrackKind } from '../prep-menu-sync';
import { useCafeBranchScope } from '../use-cafe-branch';
import { useCafeDashboardSave } from '../use-cafe-dashboard-persistence';

function salesMapFromPayload(
  record?: CafeDashboardPayload['menuDailySales'],
): Map<string, MenuDailySaleRecord[]> {
  if (!record) return new Map();
  return new Map(Object.entries(record));
}

export default function CafeMenuPage() {
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

  const { saveState, markDirty, resetDirty } = useCafeDashboardSave(
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
      const salesMap = salesMapFromPayload(payload.menuDailySales);
      const normalizedMenu = normalizeMenuItems(payload.menuItems ?? []);
      const linkedPrep = reconcilePrepWithMenu(
        normalizedMenu,
        payload.prepItems ?? [],
        payload.displayItems ?? [],
      );
      const loadedMenu = syncMenuRecipeCosts(
        normalizedMenu,
        loadedIngredients,
        salesMap,
        new Date(),
        { prepItems: linkedPrep.prepItems, displayItems: linkedPrep.displayItems },
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

  const ingredients = (dashboard?.ingredients ?? []).map((ing) => normalizeIngredient(ing));
  const menuItems = (dashboard?.menuItems ?? []) as CafeMenuRecipeItem[];
  const menuCategories = dashboard?.menuCategories?.length
    ? dashboard.menuCategories
    : MENU_DEFAULT_CATS;
  const globalOverhead = dashboard?.globalOverhead ?? 20;
  const cafeLogoUrl = dashboard?.cafeLogoUrl ?? null;
  const cafeCoverUrl = dashboard?.cafeCoverUrl ?? null;
  const cafeCoverTextColor = dashboard?.cafeCoverTextColor ?? '#ffffff';
  const cafeCoverTintStrength = dashboard?.cafeCoverTintStrength ?? 100;
  const customerMenuUrl = dashboard?.customerMenuUrl ?? null;
  const showItemImages = dashboard?.showItemImages !== false;
  const cafeOpenStart = dashboard?.cafeOpenStart ?? '07:00';
  const cafeOpenEnd = dashboard?.cafeOpenEnd ?? '19:00';
  const prepItems = dashboard?.prepItems ?? [];
  const displayItems = dashboard?.displayItems ?? [];
  const menuSalesByItemId = salesMapFromPayload(dashboard?.menuDailySales);

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

  const handleKitchenTrackChange = (menuId: string, track: KitchenTrackKind) => {
    mutateDashboard((prev) => {
      const menu = (prev.menuItems as CafeMenuRecipeItem[]).find((item) => item.id === menuId);
      if (!menu) return prev;
      const linked = setMenuKitchenTrack(
        menu,
        track,
        prev.prepItems ?? [],
        prev.displayItems ?? [],
      );
      return { ...prev, prepItems: linked.prepItems, displayItems: linked.displayItems };
    });
  };

  const handleCreateIngredientForRecipe = useCallback(
    (menuId: string, created: Ingredient) => {
      mutateDashboard((prev) => {
        const currentIngredients = prev.ingredients.map((ing) => normalizeIngredient(ing));
        const nextIngredients = currentIngredients.some((i) => i.id === created.id)
          ? currentIngredients
          : [...currentIngredients, created];
        const nextMenu = syncMenuRecipeCosts(
          (prev.menuItems as CafeMenuRecipeItem[]).map((item) => {
            if (item.id !== menuId) return item;
            if (item.recipe.some((line) => line.ingredientId === created.id)) return item;
            return {
              ...item,
              recipe: [...item.recipe, { ingredientId: created.id, quantity: 1 }],
            };
          }),
          nextIngredients,
          salesMapFromPayload(prev.menuDailySales),
          new Date(),
          { prepItems: prev.prepItems ?? [], displayItems: prev.displayItems ?? [] },
        );
        const linkedPrep = reconcilePrepWithMenu(
          nextMenu,
          prev.prepItems ?? [],
          prev.displayItems ?? [],
        );
        return {
          ...prev,
          ingredients: nextIngredients,
          menuItems: nextMenu,
          prepItems: linkedPrep.prepItems,
          displayItems: linkedPrep.displayItems,
        };
      }, true);
    },
    [mutateDashboard],
  );

  const setIngredients: React.Dispatch<React.SetStateAction<typeof ingredients>> = (updater) => {
    mutateDashboard((prev) => {
      const current = prev.ingredients.map((ing) => normalizeIngredient(ing));
      const nextIngredients = typeof updater === 'function' ? updater(current) : updater;
      const syncedMenu = syncMenuRecipeCosts(
        prev.menuItems as CafeMenuRecipeItem[],
        nextIngredients,
        salesMapFromPayload(prev.menuDailySales),
        new Date(),
        { prepItems: prev.prepItems ?? [], displayItems: prev.displayItems ?? [] },
      );
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
      const linkedPrep = reconcilePrepWithMenu(nextMenu, prev.prepItems ?? [], prev.displayItems ?? []);
      const syncedMenu = syncMenuRecipeCosts(
        nextMenu,
        normalizedIngredients,
        salesMapFromPayload(prev.menuDailySales),
        new Date(),
        { prepItems: linkedPrep.prepItems, displayItems: linkedPrep.displayItems },
      );
      return {
        ...prev,
        menuItems: syncedMenu,
        prepItems: linkedPrep.prepItems,
        displayItems: linkedPrep.displayItems,
      };
    }, true);
  };

  const setMenuCategories: React.Dispatch<React.SetStateAction<string[]>> = (updater) => {
    mutateDashboard((prev) => {
      const current = prev.menuCategories?.length ? prev.menuCategories : MENU_DEFAULT_CATS;
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, menuCategories: next };
    });
  };

  const setGlobalOverhead: React.Dispatch<React.SetStateAction<number>> = (updater) => {
    mutateDashboard((prev) => {
      const current = prev.globalOverhead ?? 20;
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, globalOverhead: next };
    });
  };

  const setCafeLogoUrl: React.Dispatch<React.SetStateAction<string | null>> = (updater) => {
    mutateDashboard((prev) => {
      const current = prev.cafeLogoUrl ?? null;
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, cafeLogoUrl: next };
    });
  };

  const setCafeCoverUrl: React.Dispatch<React.SetStateAction<string | null>> = (updater) => {
    mutateDashboard((prev) => {
      const current = prev.cafeCoverUrl ?? null;
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, cafeCoverUrl: next };
    });
  };

  const setCafeCoverTextColor: React.Dispatch<React.SetStateAction<string>> = (updater) => {
    mutateDashboard((prev) => {
      const current = prev.cafeCoverTextColor ?? '#ffffff';
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, cafeCoverTextColor: next };
    });
  };

  const setCafeCoverTintStrength: React.Dispatch<React.SetStateAction<number>> = (updater) => {
    mutateDashboard((prev) => {
      const current = prev.cafeCoverTintStrength ?? 100;
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, cafeCoverTintStrength: next };
    });
  };

  const setCustomerMenuUrl: React.Dispatch<React.SetStateAction<string | null>> = (updater) => {
    mutateDashboard((prev) => {
      const current = prev.customerMenuUrl ?? null;
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, customerMenuUrl: next };
    });
  };

  const setShowItemImages: React.Dispatch<React.SetStateAction<boolean>> = (updater) => {
    mutateDashboard((prev) => {
      const current = prev.showItemImages !== false;
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, showItemImages: next };
    }, true);
  };

  return (
    <CafePortalShell
      hubView={hubView}
      subtitle="Menu & pricing · margins and live POS sync"
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
        <ExecutivePageLoading message="Loading menu & pricing…" />
      ) : (
        <MenuEngineeringDesk
          items={menuItems}
          setItems={setMenuItems}
          ingredients={ingredients}
          setIngredients={setIngredients}
          categories={menuCategories}
          setCategories={setMenuCategories}
          globalOverhead={globalOverhead}
          setGlobalOverhead={setGlobalOverhead}
          cafeLogoUrl={cafeLogoUrl}
          setCafeLogoUrl={setCafeLogoUrl}
          cafeCoverUrl={cafeCoverUrl}
          setCafeCoverUrl={setCafeCoverUrl}
          cafeCoverTextColor={cafeCoverTextColor}
          setCafeCoverTextColor={setCafeCoverTextColor}
          cafeCoverTintStrength={cafeCoverTintStrength}
          setCafeCoverTintStrength={setCafeCoverTintStrength}
          customerMenuUrl={customerMenuUrl}
          setCustomerMenuUrl={setCustomerMenuUrl}
          showItemImages={showItemImages}
          setShowItemImages={setShowItemImages}
          cafeName={locationName ?? 'Café Tasha'}
          cafeOpenStart={cafeOpenStart}
          cafeOpenEnd={cafeOpenEnd}
          prepItems={prepItems}
          displayItems={displayItems}
          onKitchenTrackChange={handleKitchenTrackChange}
          onCreateIngredientForRecipe={handleCreateIngredientForRecipe}
          menuSalesByItemId={menuSalesByItemId}
          saveState={saveState}
          hubView={hubView}
          branchId={locationId}
        />
      )}
    </CafePortalShell>
  );
}
