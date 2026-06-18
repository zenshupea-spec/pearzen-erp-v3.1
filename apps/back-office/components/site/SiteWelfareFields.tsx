'use client';

import {
  MEAL_TYPE_OPTIONS,
  type SiteMealsProvided,
} from '../../lib/site-welfare';

type SiteWelfareFieldsProps = {
  mealsProvided: SiteMealsProvided;
  providesAccommodation: boolean;
  onMealsChange: (meals: SiteMealsProvided) => void;
  onAccommodationChange: (value: boolean) => void;
  compact?: boolean;
  onClickStop?: (e: React.MouseEvent) => void;
};

export function SiteWelfareFields({
  mealsProvided,
  providesAccommodation,
  onMealsChange,
  onAccommodationChange,
  compact = false,
  onClickStop,
}: SiteWelfareFieldsProps) {
  const labelCls = compact
    ? 'mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-slate-500'
    : 'mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500';

  const toggleMeal = (key: keyof SiteMealsProvided, checked: boolean) => {
    onMealsChange({ ...mealsProvided, [key]: checked });
  };

  return (
    <div className="space-y-3" onClick={onClickStop}>
      <div>
        <p className={labelCls}>Meals Provided by Client</p>
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/80">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/70 bg-slate-50/80">
                <th className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  Meal
                </th>
                <th className="px-2.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  Provided
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {MEAL_TYPE_OPTIONS.map(({ key, label }) => (
                <tr key={key}>
                  <td className="px-2.5 py-1.5 font-semibold text-slate-700">{label}</td>
                  <td className="px-2.5 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={mealsProvided[key]}
                      onChange={(e) => toggleMeal(key, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/40"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <label
        className={`flex cursor-pointer select-none items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-all ${
          providesAccommodation
            ? 'border-emerald-300/80 bg-emerald-50/70'
            : 'border-slate-200/80 bg-white/60 hover:bg-white/80'
        }`}
      >
        <input
          type="checkbox"
          checked={providesAccommodation}
          onChange={(e) => onAccommodationChange(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/40"
        />
        <span>
          <span className="block text-xs font-bold text-slate-800">Free accommodation provided</span>
          <span className="block text-[10px] text-slate-500">
            Tick if the client supplies guard lodging on site at no charge.
          </span>
        </span>
      </label>
    </div>
  );
}
