'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import ForgeCommerceShell from '../../components/ForgeCommerceShell';
import { FORGE_COMMERCE_THEME as C } from '../../components/forge-commerce-theme';
import {
  createForgeProductPurchase,
  fetchForgeCommerceCompanies,
  fetchForgeProductCatalog,
  fetchForgeProductPurchases,
  fetchLinkableInboxThreads,
  linkPurchaseToInboxThread,
} from '../actions';
import { purchaseStatusLabel, billingModelLabel } from '../../../../lib/forge-commerce';
import { formatLkr } from '../../../../lib/saas-billing';
import ForgePurchaseMilestones from '../components/ForgePurchaseMilestones';

export default function ForgeCommercePurchasesPage() {
  const [purchases, setPurchases] = useState<
    Awaited<ReturnType<typeof fetchForgeProductPurchases>>['purchases']
  >([]);
  const [products, setProducts] = useState<
    Awaited<ReturnType<typeof fetchForgeProductCatalog>>['products']
  >([]);
  const [companies, setCompanies] = useState<
    Awaited<ReturnType<typeof fetchForgeCommerceCompanies>>['companies']
  >([]);
  const [productId, setProductId] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [priceLkr, setPriceLkr] = useState('');
  const [notes, setNotes] = useState('');
  const [sendInvoice, setSendInvoice] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const [purchaseResult, catalogResult, companyResult] = await Promise.all([
      fetchForgeProductPurchases(),
      fetchForgeProductCatalog(),
      fetchForgeCommerceCompanies(),
    ]);

    if (purchaseResult.success) setPurchases(purchaseResult.purchases);
    else setLoadError(purchaseResult.error ?? 'Failed to load purchases');

    if (catalogResult.success) {
      const active = catalogResult.products.filter((p) => p.isActive);
      setProducts(active);
      if (!productId && active[0]) setProductId(active[0].id);
    }

    if (companyResult.success) setCompanies(companyResult.companies);

    setIsLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProduct = products.find((p) => p.id === productId);

  const handleCreate = () => {
    startTransition(async () => {
      setFormMessage(null);
      const result = await createForgeProductPurchase({
        productId,
        buyerName,
        buyerEmail,
        companyId: companyId || null,
        priceLkr: priceLkr.trim() ? Number(priceLkr) : null,
        notes: notes || null,
        sendInvoice,
      });

      if (!result.success) {
        setFormMessage(result.error ?? 'Failed to create purchase');
        return;
      }

      let msg = 'Purchase recorded';
      if (result.contactThreadId) msg += ' · linked to inbox thread';
      if (result.invoiceId) msg += ' · invoice created';
      if (result.emailWarning) msg += ` · ${result.emailWarning}`;
      else if (sendInvoice) msg += ' · invoice emailed';

      setFormMessage(msg);
      setBuyerName('');
      setBuyerEmail('');
      setNotes('');
      setPriceLkr('');
      await load();
    });
  };

  const handleLinkThread = (purchaseId: string, buyerEmail: string) => {
    startTransition(async () => {
      const threadsResult = await fetchLinkableInboxThreads(buyerEmail);
      if (!threadsResult.success || threadsResult.threads.length === 0) {
        setFormMessage('No open inbox thread found for this buyer email.');
        return;
      }
      const threadId = threadsResult.threads[0].id;
      const result = await linkPurchaseToInboxThread(purchaseId, threadId);
      if (!result.success) {
        setFormMessage(result.error ?? 'Failed to link thread');
        return;
      }
      setFormMessage('Purchase linked to inbox thread.');
      await load();
    });
  };

  return (
    <ForgeCommerceShell title="Purchases" subtitle="WFM · custom builds · websites">
      {loadError ? <div className={`${C.error} mb-6`}>{loadError}</div> : null}

      <div className={`${C.card} mb-8 space-y-4 p-5 sm:p-6`}>
        <h2 className={C.sectionTitle}>New purchase</h2>
        {formMessage ? (
          <p className={`${C.success} border-0 bg-transparent p-0 text-sm`}>{formMessage}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className={C.label}>Product</span>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                const p = products.find((x) => x.id === e.target.value);
                if (p && !priceLkr) setPriceLkr(String(p.basePriceLkr));
              }}
              className={C.input}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className={C.label}>Buyer name</span>
            <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className={C.input} />
          </label>

          <label className="space-y-1">
            <span className={C.label}>Buyer email</span>
            <input
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              className={C.input}
            />
          </label>

          <label className="space-y-1">
            <span className={C.label}>Tenant (optional)</span>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={C.input}>
              <option value="">— none —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className={C.label}>
              Price (LKR){' '}
              {selectedProduct ? `· default ${formatLkr(selectedProduct.basePriceLkr)}` : ''}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={priceLkr}
              onChange={(e) => setPriceLkr(e.target.value)}
              placeholder={selectedProduct ? String(selectedProduct.basePriceLkr) : '0'}
              className={C.input}
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className={C.label}>Notes</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={C.input}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs font-bold uppercase text-slate-600">
          <input
            type="checkbox"
            checked={sendInvoice}
            onChange={(e) => setSendInvoice(e.target.checked)}
            disabled={selectedProduct?.billingModel === 'milestone'}
            className="rounded border-slate-300"
          />
          {selectedProduct?.billingModel === 'milestone'
            ? 'Milestone purchases invoice per phase (add milestones after save)'
            : 'Create invoice and email buyer (requires RESEND_API_KEY)'}
        </label>

        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending || !productId || !buyerName.trim() || !buyerEmail.trim()}
          className={C.primaryBtn}
        >
          Record purchase
        </button>
      </div>

      <div className={`${C.tableWrap} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
          <h2 className={C.sectionTitle}>Recent purchases</h2>
          <Link href="/forge/commerce/invoices" className={C.link}>
            View invoices →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className={C.tableHead}>
              <tr>
                <th className="px-4 py-3 sm:px-6">Date</th>
                <th className="px-4 py-3 sm:px-6">Product</th>
                <th className="px-4 py-3 sm:px-6">Buyer</th>
                <th className="px-4 py-3 sm:px-6">Tenant</th>
                <th className="px-4 py-3 sm:px-6">Amount</th>
                <th className="px-4 py-3 sm:px-6">Inbox</th>
                <th className="px-4 py-3 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="animate-pulse px-6 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    No purchases yet.
                  </td>
                </tr>
              ) : (
                purchases.map((purchase) => (
                  <tr key={purchase.id} className={C.tableRow}>
                    <td className="px-4 py-4 font-mono text-xs text-slate-500 sm:px-6">
                      {purchase.createdAt.slice(0, 10)}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <p className="font-semibold text-slate-900">{purchase.productName}</p>
                      <p className="font-mono text-[10px] text-amber-700">
                        {purchase.productCode}
                        {purchase.billingModel === 'milestone'
                          ? ` · ${billingModelLabel(purchase.billingModel)}`
                          : ''}
                      </p>
                      {purchase.billingModel === 'milestone' ? (
                        <ForgePurchaseMilestones
                          purchaseId={purchase.id}
                          contractTotalLkr={purchase.priceLkr}
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <p className="text-slate-900">{purchase.buyerName}</p>
                      <p className="text-xs text-slate-500">{purchase.buyerEmail}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-500 sm:px-6">
                      {purchase.companyName ?? '—'}
                    </td>
                    <td className="px-4 py-4 font-semibold sm:px-6">
                      {formatLkr(purchase.priceLkr)}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      {purchase.contactThreadId ? (
                        <Link
                          href={`/forge/inbox?thread=${purchase.contactThreadId}`}
                          className="text-[10px] font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800"
                        >
                          View thread
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleLinkThread(purchase.id, purchase.buyerEmail)}
                          disabled={isPending}
                          className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-violet-700"
                        >
                          Link thread
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        {purchaseStatusLabel(purchase.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ForgeCommerceShell>
  );
}
