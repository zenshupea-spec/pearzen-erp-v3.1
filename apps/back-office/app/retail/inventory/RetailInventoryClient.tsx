'use client';

import { useEffect, useState, useTransition } from 'react';

import { fetchRetailProducts, saveRetailProduct } from '../actions';
import type { RetailProductRow } from '../../../lib/retail-types';

function formatMoney(value: number) {
  return `LKR ${value.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

export default function RetailInventoryClient() {
  const [products, setProducts] = useState<RetailProductRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: '',
    sku: '',
    unitPriceLkr: 0,
    stockOnHand: 0,
    reorderLevel: 5,
    published: false,
  });

  const load = async () => {
    try {
      setProducts(await fetchRetailProducts());
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load inventory');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = () => {
    startTransition(async () => {
      setMessage(null);
      const result = await saveRetailProduct({
        ...form,
        isActive: true,
      });
      if (!result.success) {
        setMessage(result.error ?? 'Failed to save product');
        return;
      }
      setMessage('Product saved.');
      setForm({
        name: '',
        sku: '',
        unitPriceLkr: 0,
        stockOnHand: 0,
        reorderLevel: 5,
        published: false,
      });
      await load();
    });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">Inventory</h1>
        <p className="mt-1 text-sm text-slate-500">Retail catalog and stock levels for this tenant.</p>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Add product</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Product name"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            value={form.sku}
            onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
            placeholder="SKU"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            type="number"
            min={0}
            value={form.unitPriceLkr}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, unitPriceLkr: Number(e.target.value) }))
            }
            placeholder="Unit price LKR"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            type="number"
            min={0}
            value={form.stockOnHand}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, stockOnHand: Number(e.target.value) }))
            }
            placeholder="Stock on hand"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            type="number"
            min={0}
            value={form.reorderLevel}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, reorderLevel: Number(e.target.value) }))
            }
            placeholder="Reorder level"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm((prev) => ({ ...prev, published: e.target.checked }))}
            />
            Published for Super App export
          </label>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save product'}
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  No products yet.
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const lowStock =
                  product.reorderLevel > 0 && product.stockOnHand <= product.reorderLevel;
                return (
                  <tr key={product.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{product.name}</div>
                      {product.sku ? (
                        <div className="text-xs text-slate-500">{product.sku}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{formatMoney(product.unitPriceLkr)}</td>
                    <td className="px-4 py-3">
                      <span className={lowStock ? 'font-bold text-amber-700' : ''}>
                        {product.stockOnHand}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs uppercase">
                      {product.published ? 'Published' : 'Internal'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
