'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';

import type { TenantLandingProduct, TenantLandingWebsiteContent } from '../../../lib/tenant-public-site-types';
import {
  fetchPearsProfileDashboard,
  formatLkr,
  publishPearsShop,
  savePearsShopDraft,
  type PearsProfileDashboard,
} from './actions';

function newProductId(): string {
  return `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyProduct(): TenantLandingProduct {
  return {
    id: newProductId(),
    name: '',
    description: '',
    priceLkr: 0,
    imageUrl: null,
    isActive: true,
  };
}

function formatPublishedAt(value: string | null): string {
  if (!value) return 'Draft only';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function PearsProfileClient() {
  const searchParams = useSearchParams();
  const companyIdParam = searchParams.get('companyId') ?? undefined;

  const [dashboard, setDashboard] = useState<PearsProfileDashboard | null>(null);
  const [shop, setShop] = useState<TenantLandingWebsiteContent | null>(null);
  const [shops, setShops] = useState<
    Awaited<ReturnType<typeof fetchPearsProfileDashboard>>['shops']
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await fetchPearsProfileDashboard(companyIdParam);
    if (result.success && result.dashboard) {
      setDashboard(result.dashboard);
      setShop(result.dashboard.shop);
      setShops(result.shops);
      setLoadError(null);
    } else {
      setDashboard(null);
      setShop(null);
      setLoadError(result.error ?? 'Failed to load PEARS profile');
    }
    setIsLoading(false);
  }, [companyIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = (task: () => Promise<{ success: boolean; error?: string }>, successText: string) => {
    if (!dashboard || !shop) return;
    startTransition(async () => {
      setActionMessage(null);
      const result = await task();
      if (!result.success) {
        setActionMessage(result.error ?? 'Action failed');
        return;
      }
      setActionMessage(successText);
      await load();
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-slate-100 px-6 py-16">
        <p className="animate-pulse text-center text-sm text-slate-500">Loading your PEARS shop…</p>
      </div>
    );
  }

  if (loadError || !dashboard || !shop) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-slate-100 px-6 py-16">
        <div className="mx-auto max-w-lg rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError ?? 'Failed to load shop'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-slate-100 px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-violet-600">PEARS</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 tracking-tight">{dashboard.companyName}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Edit your shop landing page and products. Changes save as a draft until you publish.
          </p>
        </div>

        {shops.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {shops.map((entry) => (
              <Link
                key={entry.companyId}
                href={`/pears/profile?companyId=${encodeURIComponent(entry.companyId)}`}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
                  entry.companyId === dashboard.companyId
                    ? 'border-violet-400 bg-violet-100 text-violet-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {entry.companyName}
              </Link>
            ))}
          </div>
        ) : null}

        {actionMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {actionMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Shop profile</h2>
            <p className="text-xs text-slate-500">
              {dashboard.isPublished ? `Published ${formatPublishedAt(dashboard.publishedAt)}` : 'Draft'}
              {' · '}
              {dashboard.activeProductCount} active product{dashboard.activeProductCount === 1 ? '' : 's'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(
              [
                ['companyName', 'Company name'],
                ['tagline', 'Tagline'],
                ['heroHeadline', 'Hero headline'],
                ['heroSubheadline', 'Hero subheadline'],
                ['heroCtaLabel', 'CTA label'],
                ['heroCtaHref', 'CTA link'],
                ['heroImageUrl', 'Hero image URL'],
                ['aboutTitle', 'About title'],
                ['contactEmail', 'Contact email'],
                ['contactPhone', 'Contact phone'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="space-y-1">
                <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
                <input
                  value={shop[field] ?? ''}
                  onChange={(e) =>
                    setShop({
                      ...shop,
                      [field]: field === 'heroImageUrl' && !e.target.value ? null : e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            ))}
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold uppercase text-slate-500">About body</span>
              <textarea
                value={shop.aboutBody}
                onChange={(e) => setShop({ ...shop, aboutBody: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Products</h2>
            <button
              type="button"
              onClick={() => setShop({ ...shop, products: [...shop.products, emptyProduct()] })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
            >
              Add product
            </button>
          </div>

          {shop.products.length === 0 ? (
            <p className="text-sm text-slate-500">No products yet — add your first listing for the PEARS marketplace.</p>
          ) : (
            <div className="space-y-4">
              {shop.products.map((product, index) => (
                <div key={product.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Product {index + 1}</p>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={product.isActive}
                        onChange={(e) => {
                          const products = [...shop.products];
                          products[index] = { ...product, isActive: e.target.checked };
                          setShop({ ...shop, products });
                        }}
                      />
                      Active
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs font-bold uppercase text-slate-500">Name</span>
                      <input
                        value={product.name}
                        onChange={(e) => {
                          const products = [...shop.products];
                          products[index] = { ...product, name: e.target.value };
                          setShop({ ...shop, products });
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-bold uppercase text-slate-500">Price (LKR)</span>
                      <input
                        type="number"
                        min={0}
                        value={product.priceLkr}
                        onChange={(e) => {
                          const products = [...shop.products];
                          products[index] = { ...product, priceLkr: Number(e.target.value) || 0 };
                          setShop({ ...shop, products });
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <span className="text-xs text-slate-400">{formatLkr(product.priceLkr)}</span>
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-bold uppercase text-slate-500">Description</span>
                      <textarea
                        value={product.description}
                        onChange={(e) => {
                          const products = [...shop.products];
                          products[index] = { ...product, description: e.target.value };
                          setShop({ ...shop, products });
                        }}
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-bold uppercase text-slate-500">Image URL</span>
                      <input
                        value={product.imageUrl ?? ''}
                        onChange={(e) => {
                          const products = [...shop.products];
                          products[index] = {
                            ...product,
                            imageUrl: e.target.value.trim() ? e.target.value : null,
                          };
                          setShop({ ...shop, products });
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setShop({
                        ...shop,
                        products: shop.products.filter((row) => row.id !== product.id),
                      })
                    }
                    className="text-xs font-bold uppercase tracking-wider text-rose-600 hover:text-rose-800"
                  >
                    Remove product
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                () => savePearsShopDraft({ companyId: dashboard.companyId, shop }),
                'Shop draft saved.',
              )
            }
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                () => publishPearsShop({ companyId: dashboard.companyId, shop }),
                'Shop published to your public site.',
              )
            }
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Publish shop
          </button>
          <Link
            href="/public-website"
            className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-violet-700 hover:bg-violet-100"
          >
            Preview public site
          </Link>
        </div>
      </div>
    </div>
  );
}
