'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Package,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
import {
  addIngredientStockLot,
  assignUsePriorityForNewLot,
  buildExpiryRows,
  calcPriceChangePct,
  cafeTodayStr,
  USE_PRIORITY_START,
  type FulfillmentMode,
  type Ingredient,
  type IngredientUnit,
} from './cafe-ingredient-utils';
import { syncMenuRecipeCosts, type CafeMenuRecipeItem } from './cafe-menu-sync';

function FulfillmentToggle({
  mode,
  onChange,
}: {
  mode: FulfillmentMode;
  onChange: (mode: FulfillmentMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-xl border border-slate-200/80 bg-white/70 p-0.5 text-[9px] font-black uppercase tracking-wider"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title="Driver Buy List (Bought)"
        onClick={(e) => {
          e.stopPropagation();
          onChange('bought');
        }}
        className={`rounded-lg px-2 py-1 transition-all ${
          mode === 'bought'
            ? `${CVS_BRAND_CLASSES.mobileTabActive} border-transparent`
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Bought
      </button>
      <button
        type="button"
        title="Supplier Order List (Delivered)"
        onClick={(e) => {
          e.stopPropagation();
          onChange('delivered');
        }}
        className={`rounded-lg px-2 py-1 transition-all ${
          mode === 'delivered'
            ? `${CVS_BRAND_CLASSES.mobileTabActive} border-transparent`
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Delivered
      </button>
    </div>
  );
}
function IngredientsLedger({
  ingredients,
  setIngredients,
  setItems,
  focusIngredientId = null,
}: {
  ingredients: Ingredient[];
  setIngredients: React.Dispatch<React.SetStateAction<Ingredient[]>>;
  setItems: React.Dispatch<React.SetStateAction<CafeMenuRecipeItem[]>>;
  focusIngredientId?: string | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stockAddById, setStockAddById] = useState<Record<string, { quantity: string; expiresOn: string }>>({});
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const focusHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusIngredientId) return;
    if (!ingredients.some((ing) => ing.id === focusIngredientId)) return;
    if (focusHandledRef.current === focusIngredientId) return;
    focusHandledRef.current = focusIngredientId;
    setExpandedId(focusIngredientId);
    requestAnimationFrame(() => {
      rowRefs.current.get(focusIngredientId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [focusIngredientId, ingredients]);

  const inputCls = `w-full rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${CVS_BRAND_CLASSES.focusRing} transition-all`;
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

  const applyIngredientPatch = (ing: Ingredient, patch: Partial<Ingredient>): Ingredient => {
    const updated: Ingredient = {
      ...ing,
      ...patch,
      supplier: patch.supplier ? { ...ing.supplier, ...patch.supplier } : ing.supplier,
    };
    if (patch.packagePrice !== undefined || patch.purchaseAmount !== undefined) {
      const amt = patch.purchaseAmount ?? ing.purchaseAmount;
      const price = patch.packagePrice ?? ing.packagePrice;
      if (amt > 0) {
        const nextUnitPrice = price / amt;
        if (nextUnitPrice !== ing.unitPrice) updated.prevUnitPrice = ing.unitPrice;
        updated.unitPrice = nextUnitPrice;
        updated.purchaseAmount = amt;
        updated.packagePrice = price;
      }
    }
    return updated;
  };

  const updateIngredient = (id: string, patch: Partial<Ingredient>) => {
    const next = ingredients.map((ing) => (ing.id === id ? applyIngredientPatch(ing, patch) : ing));
    setIngredients(next);
    setItems((items) => syncMenuRecipeCosts(items, next));
  };

  const removeIngredient = (id: string) => {
    if (expandedId === id) setExpandedId(null);
    const next = ingredients.filter((i) => i.id !== id);
    setIngredients(next);
    setItems((items) =>
      syncMenuRecipeCosts(
        items.map((item) => ({
          ...item,
          recipe: item.recipe.filter((line) => line.ingredientId !== id),
        })),
        next,
      ),
    );
  };

  const toggleExpanded = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const getStockAddForm = (ingId: string) =>
    stockAddById[ingId] ?? { quantity: '', expiresOn: '' };

  const setStockAddForm = (ingId: string, patch: Partial<{ quantity: string; expiresOn: string }>) => {
    setStockAddById((prev) => ({
      ...prev,
      [ingId]: { ...getStockAddForm(ingId), ...patch },
    }));
  };

  const handleAddStock = (ing: Ingredient) => {
    const formState = getStockAddForm(ing.id);
    const quantity = Math.max(0, parseFloat(formState.quantity) || 0);
    if (quantity <= 0 || !formState.expiresOn) return;
    const next = ingredients.map((row) =>
      row.id === ing.id ? addIngredientStockLot(row, quantity, formState.expiresOn) : row,
    );
    setIngredients(next);
    setItems((items) => syncMenuRecipeCosts(items, next));
    setStockAddById((prev) => {
      const copy = { ...prev };
      delete copy[ing.id];
      return copy;
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <tr>
            <th className="px-4 py-3">Ingredient</th>
            <th className="px-4 py-3">Brand</th>
            <th className="px-4 py-3 text-center">Unit</th>
            <th className="px-4 py-3 text-center">Amount</th>
            <th className="px-4 py-3 text-center">Price (LKR)</th>
            <th className="px-4 py-3 text-center">On Hand</th>
            <th className="px-4 py-3 text-center">Δ Since Last</th>
            <th className="px-4 py-3 text-center">Source</th>
            <th className="px-4 py-3 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/60">
          {ingredients.map((ing) => {
            const pricePct = calcPriceChangePct(ing.unitPrice, ing.prevUnitPrice);
            const belowMinimum =
              ing.minimumStock > 0 && ing.currentStock < ing.minimumStock;
            const isExpanded = expandedId === ing.id;
            return (
              <React.Fragment key={ing.id}>
                <tr
                  ref={(el) => {
                    if (el) rowRefs.current.set(ing.id, el);
                    else rowRefs.current.delete(ing.id);
                  }}
                  className={`hover:bg-white/40 transition-colors group cursor-pointer ${isExpanded ? 'bg-white/50' : ''} ${
                    focusIngredientId === ing.id ? 'ring-2 ring-inset ring-[color:var(--cvs-accent)]/50' : ''
                  }`}
                  onClick={() => toggleExpanded(ing.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                      )}
                      <input
                        type="text"
                        value={ing.name}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateIngredient(ing.id, { name: e.target.value })}
                        className={`${inputCls} font-semibold`}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={ing.brand ?? ''}
                      onChange={(e) => updateIngredient(ing.id, { brand: e.target.value })}
                      className={inputCls}
                      placeholder="Brand"
                    />
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={ing.unit}
                      onChange={(e) => updateIngredient(ing.id, { unit: e.target.value as IngredientUnit })}
                      className={`${inputCls} w-20 text-center`}
                    >
                      <option value="ml">ml</option>
                      <option value="gm">gm</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={ing.purchaseAmount}
                        onChange={(e) =>
                          updateIngredient(ing.id, { purchaseAmount: Math.max(1, parseFloat(e.target.value) || 1) })
                        }
                        className={`${inputCls} w-24 text-center font-mono`}
                      />
                      <span className="text-[10px] text-slate-500">{ing.unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={ing.packagePrice}
                      onChange={(e) =>
                        updateIngredient(ing.id, { packagePrice: Math.max(0, parseFloat(e.target.value) || 0) })
                      }
                      className={`${inputCls} w-24 text-center font-mono`}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex flex-col items-center font-mono text-sm font-black tabular-nums ${
                        belowMinimum ? 'text-rose-800' : ing.currentStock > 0 ? 'text-slate-800' : 'text-slate-400'
                      }`}
                      title={
                        belowMinimum
                          ? `Below MD minimum (${ing.minimumStock.toLocaleString()} ${ing.unit})`
                          : 'Live stock from active lots'
                      }
                    >
                      {ing.currentStock.toLocaleString()}
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                        {ing.unit}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {pricePct !== null ? (
                      <span
                        className={`inline-flex items-center gap-0.5 font-mono text-sm font-bold tabular-nums ${
                          pricePct > 0 ? 'text-rose-700' : pricePct < 0 ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {pricePct > 0 ? <TrendingUp className="h-3 w-3" /> : pricePct < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                        {pricePct > 0 ? '+' : ''}
                        {pricePct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <FulfillmentToggle
                      mode={ing.fulfillmentMode}
                      onChange={(mode) => updateIngredient(ing.id, { fulfillmentMode: mode })}
                    />
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => removeIngredient(ing.id)}
                      className="rounded-xl border border-slate-200/80 bg-white/60 p-1.5 text-slate-400 opacity-0 transition-all group-hover:opacity-100 hover:border-rose-200/80 hover:text-rose-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>

                {isExpanded && (
                  <tr className="bg-[var(--cvs-accent-soft)]/25">
                    <td colSpan={9} className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="rounded-2xl border border-[color:var(--cvs-accent-muted)]/60 bg-white/70 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--cvs-accent)]">
                            Supplier — {ing.name}
                          </p>
                          <button
                            type="button"
                            onClick={() => setExpandedId(null)}
                            className="flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-500 hover:border-slate-300 hover:text-slate-700"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Done
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <div>
                            <label className={labelCls}>Supplier Name</label>
                            <input
                              type="text"
                              value={ing.supplier.name}
                              onChange={(e) =>
                                updateIngredient(ing.id, { supplier: { ...ing.supplier, name: e.target.value } })
                              }
                              className={inputCls}
                              placeholder="e.g. Highland Dairies"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className={labelCls}>Address</label>
                            <input
                              type="text"
                              value={ing.supplier.address}
                              onChange={(e) =>
                                updateIngredient(ing.id, { supplier: { ...ing.supplier, address: e.target.value } })
                              }
                              className={inputCls}
                              placeholder="Street, city"
                            />
                          </div>
                          <div>
                            <label className={labelCls}>Phone</label>
                            <input
                              type="text"
                              value={ing.supplier.phone}
                              onChange={(e) =>
                                updateIngredient(ing.id, { supplier: { ...ing.supplier, phone: e.target.value } })
                              }
                              className={inputCls}
                              placeholder="+94 …"
                            />
                          </div>
                        </div>

                        {(() => {
                          const activeLots = ing.stockLots
                            .filter((lot) => lot.quantity > 0)
                            .sort(
                              (a, b) =>
                                (a.usePriority ?? USE_PRIORITY_START) - (b.usePriority ?? USE_PRIORITY_START) ||
                                a.expiresOn.localeCompare(b.expiresOn),
                            );
                          const stockForm = getStockAddForm(ing.id);
                          const addQty = Math.max(0, parseFloat(stockForm.quantity) || 0);
                          const previewPriority =
                            addQty > 0 && stockForm.expiresOn
                              ? assignUsePriorityForNewLot(ing.stockLots, stockForm.expiresOn)
                              : null;

                          return (
                            <div className="mt-5 space-y-4 border-t border-[color:var(--cvs-accent-muted)]/80 pt-4">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--cvs-accent)]">
                                  Stock on Hand
                                </p>
                                <p className="mt-0.5 text-[9px] leading-relaxed text-slate-500">
                                  Write the use number on each package — lower number = use first. Same expiry date
                                  shares one number. Sales and wastage deduct from the lowest number first.
                                </p>
                              </div>

                              {activeLots.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
                                  No stock yet — add a lot below with quantity and expiry date.
                                </p>
                              ) : (
                                <ul className="space-y-2">
                                  {activeLots.map((lot) => (
                                    <li
                                      key={lot.id}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="inline-flex min-w-[2.75rem] items-center justify-center rounded-lg border border-[color:var(--cvs-accent-muted)]/80 bg-[var(--cvs-accent-soft)]/90 px-2 py-1 font-mono text-sm font-black tabular-nums text-[color:var(--cvs-accent)]">
                                          {lot.usePriority ?? USE_PRIORITY_START}
                                        </span>
                                        <span className="font-mono text-sm font-bold tabular-nums text-slate-800">
                                          {lot.quantity.toLocaleString()} {ing.unit}
                                        </span>
                                      </div>
                                      <span className="font-mono text-xs text-slate-600">
                                        exp {lot.expiresOn}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-4">
                                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-emerald-900">
                                  Add to Stock
                                </p>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                  <div>
                                    <label className={labelCls}>Quantity ({ing.unit})</label>
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={stockForm.quantity}
                                      onChange={(e) => setStockAddForm(ing.id, { quantity: e.target.value })}
                                      className={inputCls}
                                      placeholder={`e.g. ${ing.purchaseAmount}`}
                                    />
                                  </div>
                                  <div>
                                    <label className={labelCls}>
                                      Expiry Date <span className="text-rose-600">*</span>
                                    </label>
                                    <input
                                      type="date"
                                      min={cafeTodayStr()}
                                      value={stockForm.expiresOn}
                                      onChange={(e) => setStockAddForm(ing.id, { expiresOn: e.target.value })}
                                      className={inputCls}
                                    />
                                  </div>
                                  <div className="flex flex-col justify-end">
                                    {previewPriority != null ? (
                                      <p className="mb-2 rounded-lg border border-[color:var(--cvs-accent-muted)]/80 bg-[var(--cvs-accent-soft)]/80 px-3 py-2 text-center text-xs font-bold text-[color:var(--cvs-accent)]">
                                        Write{' '}
                                        <span className="font-mono text-base tabular-nums">{previewPriority}</span>{' '}
                                        on the package
                                      </p>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => handleAddStock(ing)}
                                      disabled={addQty <= 0 || !stockForm.expiresOn}
                                      className="rounded-xl bg-[color:var(--cvs-accent)] px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow-md shadow-[color:var(--cvs-glow)] hover:bg-[color:var(--cvs-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      Add to Stock
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function IngredientsLedgerPanel({
  ingredients,
  setIngredients,
  menuItems,
  setMenuItems,
  focusIngredientId = null,
}: {
  ingredients: Ingredient[];
  setIngredients: React.Dispatch<React.SetStateAction<Ingredient[]>>;
  menuItems: CafeMenuRecipeItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<CafeMenuRecipeItem[]>>;
  focusIngredientId?: string | null;
}) {
  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[color:var(--cvs-accent-muted)]/80 bg-[var(--cvs-accent-soft)]/80">
              <Package className="h-4 w-4 text-[color:var(--cvs-accent)]" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">
                Ingredients Ledger
              </h2>
              <p className="mt-0.5 max-w-2xl text-[10px] leading-relaxed text-slate-500">
                Package amounts in ml or gm only. New ingredients are created from the menu recipe builder.
                Price change shows % since last purchase. Expand a row to add stock — each lot gets a use
                number (lower = use first) to write on the package. Bought items appear on the driver buy
                list; delivered items go to the supplier order list when stock falls below the MD minimum.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-[color:var(--cvs-accent-muted)]/80 bg-[var(--cvs-accent-soft)]/80 px-3 py-1 text-[10px] font-black text-[color:var(--cvs-accent)]">
            {ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <IngredientsLedger
        ingredients={ingredients}
        setIngredients={setIngredients}
        setItems={setMenuItems}
        focusIngredientId={focusIngredientId}
      />
    </ExecutiveGlassCard>
  );
}

function ExpiryStatusBadge({ daysLeft }: { daysLeft: number }) {
  if (daysLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/80 bg-rose-100/90 px-2 py-0.5 text-[9px] font-black text-rose-900">
        <AlertTriangle className="h-2.5 w-2.5" />
        Expired {Math.abs(daysLeft)}d ago
      </span>
    );
  }
  if (daysLeft <= 3) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/80 bg-rose-50/90 px-2 py-0.5 text-[9px] font-black text-rose-800">
        <AlertTriangle className="h-2.5 w-2.5" />
        {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
      </span>
    );
  }
  if (daysLeft <= 7) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/90 px-2 py-0.5 text-[9px] font-black text-amber-800">
        <Clock className="h-2.5 w-2.5" />
        {daysLeft}d left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2 py-0.5 text-[9px] font-black text-emerald-800">
      <CheckCircle2 className="h-2.5 w-2.5" />
      {daysLeft}d left
    </span>
  );
}

export function ExpiryTrackingPanel({
  ingredients,
  readOnly = false,
}: {
  ingredients: Ingredient[];
  /** Café front office — view lots only; stock changes happen on MD desk */
  readOnly?: boolean;
}) {
  const rows = useMemo(() => buildExpiryRows(ingredients), [ingredients]);
  const expired = rows.filter((r) => r.daysLeft < 0).length;
  const urgent = rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 3).length;

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-amber-200/80 bg-amber-50/80">
              <CalendarDays className="h-4 w-4 text-amber-700" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">
                Expiry Tracking
              </h2>
              <p className="mt-0.5 max-w-2xl text-[10px] leading-relaxed text-slate-500">
                {readOnly
                  ? 'View-only at the counter — managers receive stock and set expiry on Café Backoffice.'
                  : 'Stock lots sorted by use number (lowest first). Set expiry when adding stock or receiving procurement — sales and wastage deduct from the lowest number first.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {expired > 0 && (
              <span className="rounded-full border border-rose-200/80 bg-rose-50/80 px-2.5 py-1 text-[10px] font-black text-rose-800">
                {expired} expired
              </span>
            )}
            {urgent > 0 && (
              <span className="rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-[10px] font-black text-amber-800">
                {urgent} due ≤3d
              </span>
            )}
            <span className="rounded-full border border-slate-200/80 bg-white/70 px-2.5 py-1 text-[10px] font-black text-slate-600">
              {rows.length} lot{rows.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {readOnly ? (
        <div className="border-b border-amber-200/70 bg-amber-50/80 px-5 py-3 text-xs leading-relaxed text-amber-950">
          <span className="font-bold uppercase tracking-wide">View only</span> — counter staff cannot
          receive stock or log wastage here. Report spoilage to your manager; they update ingredients and
          expiry lots on{' '}
          <span className="font-semibold">Café Backoffice → Ingredients / Expiry</span>.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          {readOnly
            ? 'No expiry lots on file yet. Your manager adds opening stock and procurement on Café Backoffice.'
            : 'No expiry-tracked stock yet — add opening stock with an expiry date or receive procurement with a lot date.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-5 py-3">Ingredient</th>
                <th className="px-5 py-3 text-center">Use #</th>
                <th className="px-5 py-3 text-center">Qty on Hand</th>
                <th className="px-5 py-3 text-center">Expires</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {rows.map((row) => (
                <tr
                  key={row.lotId}
                  className={`transition-colors hover:bg-white/40 ${
                    row.daysLeft < 0
                      ? 'bg-rose-50/40'
                      : row.daysLeft <= 3
                        ? 'bg-amber-50/30'
                        : ''
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-slate-900">{row.ingredientName}</p>
                    {row.brand ? (
                      <p className="text-[10px] text-slate-500">{row.brand}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="inline-flex min-w-[2.5rem] items-center justify-center rounded-lg border border-[color:var(--cvs-accent-muted)]/80 bg-[var(--cvs-accent-soft)]/80 px-2 py-0.5 font-mono text-sm font-black tabular-nums text-[color:var(--cvs-accent)]">
                      {row.usePriority}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center font-mono text-sm font-black tabular-nums text-slate-800">
                    {row.quantity.toLocaleString()} {row.unit}
                  </td>
                  <td className="px-5 py-3.5 text-center font-mono text-sm text-slate-700">
                    {row.expiresOn}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <ExpiryStatusBadge daysLeft={row.daysLeft} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ExecutiveGlassCard>
  );
}

