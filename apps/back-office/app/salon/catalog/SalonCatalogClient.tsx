'use client';

import { useEffect, useState, useTransition } from 'react';

import {
  fetchSalonProducts,
  fetchSalonServices,
  saveSalonProduct,
  saveSalonService,
} from '../actions';
import type { SalonProductRow, SalonServiceRow } from '../../../lib/salon-types';

export default function SalonCatalogClient() {
  const [services, setServices] = useState<SalonServiceRow[]>([]);
  const [products, setProducts] = useState<SalonProductRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [serviceForm, setServiceForm] = useState({
    name: '',
    durationMinutes: 60,
    priceLkr: 0,
  });
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    unitPriceLkr: 0,
    stockOnHand: 0,
  });

  const load = async () => {
    try {
      const [serviceRows, productRows] = await Promise.all([
        fetchSalonServices(),
        fetchSalonProducts(),
      ]);
      setServices(serviceRows);
      setProducts(productRows);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load catalog');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveService = () => {
    startTransition(async () => {
      setMessage(null);
      const result = await saveSalonService({
        ...serviceForm,
        isActive: true,
      });
      if (!result.success) {
        setMessage(result.error ?? 'Failed to save service');
        return;
      }
      setMessage('Service saved.');
      setServiceForm({ name: '', durationMinutes: 60, priceLkr: 0 });
      await load();
    });
  };

  const saveProduct = () => {
    startTransition(async () => {
      setMessage(null);
      const result = await saveSalonProduct({
        ...productForm,
        isActive: true,
      });
      if (!result.success) {
        setMessage(result.error ?? 'Failed to save product');
        return;
      }
      setMessage('Product saved.');
      setProductForm({ name: '', sku: '', unitPriceLkr: 0, stockOnHand: 0 });
      await load();
    });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">Catalog</h1>
        <p className="mt-1 text-sm text-slate-500">Services and retail products for this salon tenant.</p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Add service</h2>
          <div className="mt-4 space-y-3">
            <input
              value={serviceForm.name}
              onChange={(e) => setServiceForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Service name"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min={15}
                value={serviceForm.durationMinutes}
                onChange={(e) =>
                  setServiceForm((prev) => ({
                    ...prev,
                    durationMinutes: Number(e.target.value),
                  }))
                }
                placeholder="Minutes"
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
              <input
                type="number"
                min={0}
                value={serviceForm.priceLkr}
                onChange={(e) =>
                  setServiceForm((prev) => ({ ...prev, priceLkr: Number(e.target.value) }))
                }
                placeholder="Price LKR"
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={saveService}
              disabled={isPending}
              className="rounded-xl bg-rose-600 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
            >
              Save service
            </button>
          </div>
          <ul className="mt-6 space-y-2 text-sm">
            {services.map((service) => (
              <li
                key={service.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
              >
                <span className="font-semibold">{service.name}</span>
                <span className="text-slate-500">
                  {service.durationMinutes}m · LKR {service.priceLkr.toLocaleString('en-LK')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Add product</h2>
          <div className="mt-4 space-y-3">
            <input
              value={productForm.name}
              onChange={(e) => setProductForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Product name"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            />
            <input
              value={productForm.sku}
              onChange={(e) => setProductForm((prev) => ({ ...prev, sku: e.target.value }))}
              placeholder="SKU"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min={0}
                value={productForm.unitPriceLkr}
                onChange={(e) =>
                  setProductForm((prev) => ({ ...prev, unitPriceLkr: Number(e.target.value) }))
                }
                placeholder="Price LKR"
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
              <input
                type="number"
                min={0}
                value={productForm.stockOnHand}
                onChange={(e) =>
                  setProductForm((prev) => ({ ...prev, stockOnHand: Number(e.target.value) }))
                }
                placeholder="Stock"
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={saveProduct}
              disabled={isPending}
              className="rounded-xl bg-rose-600 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
            >
              Save product
            </button>
          </div>
          <ul className="mt-6 space-y-2 text-sm">
            {products.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
              >
                <span className="font-semibold">{product.name}</span>
                <span className="text-slate-500">
                  Stock {product.stockOnHand} · LKR {product.unitPriceLkr.toLocaleString('en-LK')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
