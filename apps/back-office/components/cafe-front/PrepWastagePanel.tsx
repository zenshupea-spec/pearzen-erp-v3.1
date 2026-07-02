'use client';

import { useEffect, useState } from 'react';
import { ChefHat } from 'lucide-react';

import PwaPortalLoading from '../../../../packages/pwa-shell/PwaPortalLoading';
import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import { getCafeFrontDashboard } from '../../app/cafe-front/actions';
import { weekdayShortLabel } from '../../app/executive/cafe/cafe-menu-velocity';

export function PrepWastagePanel() {
  const [prepItems, setPrepItems] = useState<
    Array<{ id: string; name: string; currentStock: number; rollingAvg14d: number }>
  >([]);
  const [displayItems, setDisplayItems] = useState<
    Array<{ id: string; name: string; currentWhole: number; currentSlices: number; rollingAvg14d: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const weekdayLabel = weekdayShortLabel(new Date());

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
          rollingAvg14d: item.rollingAvg14d,
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
          Display items show how many to make today from the same-weekday sales average. Stock counts are
          view-only — managers update prep and wastage on Café Backoffice.
        </p>
      </div>

      <div className="border-b border-amber-200/70 bg-amber-50/80 px-5 py-3 text-xs leading-relaxed text-amber-950">
        <span className="font-bold uppercase tracking-wide">View only</span> — log spoilage with your
        manager; they record wastage and receive stock on{' '}
        <span className="font-semibold">Café Backoffice → Menu / Ingredients</span>. This panel is for
        today&apos;s prep targets, not stock adjustments.
      </div>

      <div className="p-5">
        {loading ? (
          <PwaPortalLoading portal="cafe-front" message="Loading prep tracker…" className="min-h-[10rem] py-8" />
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
                <p className="mt-1 text-xs font-bold text-amber-900">
                  Make {weekdayLabel} today: {item.rollingAvg14d.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  On display: {item.currentWhole} whole · {item.currentSlices} loose
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </ExecutiveGlassCard>
  );
}
