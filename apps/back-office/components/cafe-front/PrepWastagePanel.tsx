'use client';

import { useEffect, useState } from 'react';
import { ChefHat } from 'lucide-react';

import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import { getCafeFrontDashboard } from '../../app/cafe-front/actions';

export function PrepWastagePanel() {
  const [prepItems, setPrepItems] = useState<
    Array<{ id: string; name: string; currentStock: number; rollingAvg14d: number }>
  >([]);
  const [displayItems, setDisplayItems] = useState<
    Array<{ id: string; name: string; currentWhole: number; currentSlices: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getCafeFrontDashboard().then((payload) => {
      setPrepItems(
        (payload.prepItems ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          currentStock: item.currentStock,
          rollingAvg14d: item.rollingAvg14d,
        })),
      );
      setDisplayItems(
        (payload.displayItems ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          currentWhole: item.currentWhole,
          currentSlices: item.currentSlices,
        })),
      );
      setLoading(false);
    });
  }, []);

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-violet-600" />
          <h2 className="text-lg font-bold uppercase text-slate-800">Predictive Prep &amp; Wastage</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Read-only view — only menu items set to Prep or Display in the backoffice are tracked here.
        </p>
      </div>

      <div className="p-5">
        {loading ? (
          <p className="text-sm text-slate-500">Loading prep tracker…</p>
        ) : prepItems.length === 0 && displayItems.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200/80 px-4 py-6 text-center text-xs text-slate-500">
            No prep or display items linked yet.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {prepItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-violet-200/70 bg-violet-50/40 px-4 py-3"
              >
                <p className="text-sm font-bold text-slate-900">{item.name}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Stock {item.currentStock} · 14d avg {item.rollingAvg14d}
                </p>
              </div>
            ))}
            {displayItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-amber-200/70 bg-amber-50/40 px-4 py-3"
              >
                <p className="text-sm font-bold text-slate-900">{item.name}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {item.currentWhole} whole · {item.currentSlices} slices
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </ExecutiveGlassCard>
  );
}
