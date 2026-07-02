'use client';

import { useEffect, useState } from 'react';

import { CafeFrontSessionGate } from '../../../components/cafe-front/CafeFrontSessionGate';
import PwaPortalLoading from '../../../../../packages/pwa-shell/PwaPortalLoading';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { ExpiryTrackingPanel } from '../../executive/cafe/cafe-ingredients-panels';
import { getCafeFrontDashboard } from '../actions';
import { normalizeIngredient } from '../../executive/cafe/cafe-ingredient-utils';

export default function CafeFrontExpiryPage() {
  return (
    <CafeFrontSessionGate subtitle="Expiry lots · use number 200+ to pick stock first">
      {() => <ExpiryContent />}
    </CafeFrontSessionGate>
  );
}

function ExpiryContent() {
  const [ingredients, setIngredients] = useState<ReturnType<typeof normalizeIngredient>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getCafeFrontDashboard().then((payload) => {
      setIngredients((payload.ingredients ?? []).map((ing) => normalizeIngredient(ing)));
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <PwaPortalLoading portal="cafe-front" message="Loading expiry tracker…" className="min-h-[12rem]" />
    );
  }

  return <ExpiryTrackingPanel ingredients={ingredients} readOnly />;
}
