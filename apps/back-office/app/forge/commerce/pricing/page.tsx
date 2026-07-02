'use client';

import { useEffect, useState, useTransition } from 'react';
import ForgeCommerceShell from '../../components/ForgeCommerceShell';
import { FORGE_COMMERCE_THEME as C } from '../../components/forge-commerce-theme';
import { fetchForgeProductCatalog, updateForgeProductPricing } from '../actions';
import { billingModelLabel } from '../../../../lib/forge-commerce';
import { formatLkr } from '../../../../lib/saas-billing';

type Draft = {
  basePriceLkr: string;
  isActive: boolean;
  description: string;
};

export default function ForgeCommercePricingPage() {
  const [products, setProducts] = useState<
    Awaited<ReturnType<typeof fetchForgeProductCatalog>>['products']
  >([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const result = await fetchForgeProductCatalog();
    if (result.success) {
      setProducts(result.products);
      setDrafts(
        Object.fromEntries(
          result.products.map((p) => [
            p.id,
            {
              basePriceLkr: String(p.basePriceLkr),
              isActive: p.isActive,
              description: p.description ?? '',
            },
          ]),
        ),
      );
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Failed to load');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = (productId: string) => {
    const draft = drafts[productId];
    if (!draft) return;

    startTransition(async () => {
      setSaveMessage(null);
      const result = await updateForgeProductPricing({
        id: productId,
        basePriceLkr: Number(draft.basePriceLkr) || 0,
        isActive: draft.isActive,
        description: draft.description,
      });
      if (!result.success) {
        setSaveMessage(result.error ?? 'Save failed');
        return;
      }
      setSaveMessage('Pricing updated.');
      await load();
    });
  };

  return (
    <ForgeCommerceShell title="Product Pricing" subtitle="List prices · not ERP per-employee rates">
      {loadError ? <div className={`${C.error} mb-6`}>{loadError}</div> : null}
      {saveMessage ? (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            saveMessage.includes('failed') || saveMessage.includes('Failed')
              ? C.error
              : C.success
          }`}
        >
          {saveMessage}
        </div>
      ) : null}

      {isLoading ? (
        <p className="animate-pulse text-sm text-slate-500">Loading pricing…</p>
      ) : (
        <div className="space-y-4">
          {products.map((product) => {
            const draft = drafts[product.id];
            if (!draft) return null;

            return (
              <div key={product.id} className={`${C.card} space-y-4 p-5 sm:p-6`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700">
                      {product.code}
                    </p>
                    <h2 className="text-lg font-bold text-slate-900">{product.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {billingModelLabel(product.billingModel)} · current list{' '}
                      {product.basePriceLkr > 0 ? formatLkr(product.basePriceLkr) : 'quote-based'}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold uppercase text-slate-600">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [product.id]: { ...draft, isActive: e.target.checked },
                        }))
                      }
                      className="rounded border-slate-300"
                    />
                    Active for sale
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className={C.label}>Description</span>
                  <textarea
                    rows={2}
                    value={draft.description}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [product.id]: { ...draft, description: e.target.value },
                      }))
                    }
                    className={C.input}
                  />
                </label>

                <div className="flex flex-wrap items-end gap-4">
                  <label className="space-y-1">
                    <span className={C.label}>Base price (LKR)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.basePriceLkr}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [product.id]: { ...draft, basePriceLkr: e.target.value },
                        }))
                      }
                      className={`${C.inputCompact} w-40`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSave(product.id)}
                    disabled={isPending}
                    className={C.primaryBtn}
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ForgeCommerceShell>
  );
}
