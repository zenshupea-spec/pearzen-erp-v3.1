'use client';

import { useEffect, useState } from 'react';
import StaffPortalLoading from '../../../../components/portal/StaffPortalLoading';
import ForgeCommerceShell from '../../components/ForgeCommerceShell';
import { FORGE_COMMERCE_THEME as C } from '../../components/forge-commerce-theme';
import { fetchForgeProductCatalog } from '../actions';
import { billingModelLabel } from '../../../../lib/forge-commerce';
import { formatLkr } from '../../../../lib/saas-billing';

export default function ForgeCommerceCatalogPage() {
  const [products, setProducts] = useState<Awaited<ReturnType<typeof fetchForgeProductCatalog>>['products']>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchForgeProductCatalog().then((result) => {
      if (result.success) {
        setProducts(result.products);
        setLoadError(null);
      } else {
        setLoadError(result.error ?? 'Failed to load');
      }
      setIsLoading(false);
    });
  }, []);

  return (
    <ForgeCommerceShell title="Product Catalog" subtitle="WFM · custom software · websites · verticals">
      <div className={`${C.hint} mb-6`}>
        Products sold separately from ERP tenant subscriptions. Edit list prices on the{' '}
        <strong>Pricing</strong> tab; record sales on <strong>Purchases</strong>.
      </div>

      {loadError ? <div className={`${C.error} mb-6`}>{loadError}</div> : null}

      {isLoading ? (
        <StaffPortalLoading portal="forge" message="Loading catalog…" className="min-h-[16rem]" />
      ) : (
      <div className={`${C.tableWrap} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className={C.tableHead}>
              <tr>
                <th className="px-4 py-3 sm:px-6">Code</th>
                <th className="px-4 py-3 sm:px-6">Product</th>
                <th className="px-4 py-3 sm:px-6">Billing</th>
                <th className="px-4 py-3 sm:px-6">List price</th>
                <th className="px-4 py-3 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No products in catalog.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className={C.tableRow}>
                    <td className="px-4 py-4 font-mono text-xs text-amber-700 sm:px-6">{product.code}</td>
                    <td className="px-4 py-4 sm:px-6">
                      <p className="font-semibold text-slate-900">{product.name}</p>
                      {product.description ? (
                        <p className="mt-1 max-w-md text-xs text-slate-500">{product.description}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-slate-600 sm:px-6">
                      {billingModelLabel(product.billingModel)}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-900 sm:px-6">
                      {product.basePriceLkr > 0 ? formatLkr(product.basePriceLkr) : 'Quote'}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          product.isActive
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-100 text-slate-500'
                        }`}
                      >
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </ForgeCommerceShell>
  );
}
