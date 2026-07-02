'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import StaffPortalLoading from '../../../components/portal/StaffPortalLoading';
import {
  inquiryProductLabel,
  resolveSuggestedProductCode,
  type ForgeInquiryProductCode,
} from '../../../lib/forge-commerce-inbox';
import { formatLkr } from '../../../lib/saas-billing';
import type { ForgeProductPurchase } from '../../../lib/forge-commerce';
import type { ForgeProductCatalogItem } from '../../../lib/forge-commerce';
import {
  createPurchaseFromThreadAction,
  fetchForgeContactThreadAction,
  fetchForgeContactThreadsAction,
  fetchThreadCommerceContextAction,
  sendForgeContactReplyAction,
} from './actions';
import type { ForgeContactMessage, ForgeContactThread } from '../../../lib/forge-contact-inbox';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function messagePreview(message: ForgeContactMessage | undefined): string {
  if (!message) return 'No messages yet';
  const text = message.bodyText?.trim();
  if (text) return text.slice(0, 120);
  return message.direction === 'inbound' ? 'Inbound message' : 'Your reply';
}

export default function ForgeContactInboxClient() {
  const searchParams = useSearchParams();
  const threadFromUrl = searchParams.get('thread');

  const [threads, setThreads] = useState<ForgeContactThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ForgeContactMessage[]>([]);
  const [selectedThread, setSelectedThread] = useState<ForgeContactThread | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [commerceMessage, setCommerceMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [commerceProducts, setCommerceProducts] = useState<ForgeProductCatalogItem[]>([]);
  const [linkedPurchases, setLinkedPurchases] = useState<ForgeProductPurchase[]>([]);
  const [suggestedProductCode, setSuggestedProductCode] = useState<string | null>(null);
  const [productId, setProductId] = useState('');
  const [priceLkr, setPriceLkr] = useState('');
  const [sendInvoice, setSendInvoice] = useState(true);

  const loadThreads = async () => {
    setIsLoading(true);
    const result = await fetchForgeContactThreadsAction();
    if (!result.ok) {
      setError(result.error);
      setThreads([]);
    } else {
      setError(null);
      setThreads(result.threads);
      const preferred =
        threadFromUrl && result.threads.some((t) => t.id === threadFromUrl)
          ? threadFromUrl
          : result.threads[0]?.id ?? null;
      setSelectedId((current) => current ?? preferred);
    }
    setIsLoading(false);
  };

  const loadThread = async (threadId: string) => {
    const [threadResult, commerceResult] = await Promise.all([
      fetchForgeContactThreadAction(threadId),
      fetchThreadCommerceContextAction(threadId),
    ]);

    if (!threadResult.ok) {
      setError(threadResult.error);
      setSelectedThread(null);
      setMessages([]);
      return;
    }

    setError(null);
    setSelectedThread(threadResult.thread);
    setMessages(threadResult.messages);

    if (commerceResult.ok) {
      setCommerceProducts(commerceResult.products);
      setLinkedPurchases(commerceResult.purchases);
      setSuggestedProductCode(commerceResult.suggestedProductCode);
      const initialProductId =
        commerceResult.suggestedProductId ?? commerceResult.products[0]?.id ?? '';
      setProductId(initialProductId);
      const initialProduct = commerceResult.products.find((p) => p.id === initialProductId);
      setPriceLkr(initialProduct ? String(initialProduct.basePriceLkr) : '');
    } else {
      setCommerceProducts([]);
      setLinkedPurchases([]);
      setSuggestedProductCode(null);
    }
  };

  useEffect(() => {
    if (threadFromUrl) {
      setSelectedId(threadFromUrl);
    }
  }, [threadFromUrl]);

  useEffect(() => {
    void loadThreads();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedThread(null);
      setMessages([]);
      return;
    }
    void loadThread(selectedId);
  }, [selectedId]);

  const handleSend = () => {
    if (!selectedId || !reply.trim()) return;
    startTransition(async () => {
      const result = await sendForgeContactReplyAction(selectedId, reply);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReply('');
      await loadThreads();
      await loadThread(selectedId);
    });
  };

  const handleRecordPurchase = () => {
    if (!selectedId || !productId) return;
    startTransition(async () => {
      setCommerceMessage(null);
      const result = await createPurchaseFromThreadAction({
        threadId: selectedId,
        productId,
        priceLkr: priceLkr.trim() ? Number(priceLkr) : null,
        sendInvoice,
      });

      if (!result.ok) {
        setCommerceMessage(result.error);
        return;
      }

      let msg = 'Purchase recorded and linked to this thread.';
      if (result.invoiceId) msg += ' Invoice created.';
      if (result.emailWarning) msg += ` ${result.emailWarning}`;
      else if (sendInvoice) msg += ' Invoice emailed to buyer.';

      setCommerceMessage(msg);
      await loadThreads();
      await loadThread(selectedId);
    });
  };

  const selectedProduct = commerceProducts.find((p) => p.id === productId);

  return (
    <div className="grid min-h-[70vh] grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111118]">
        <div className="border-b border-slate-800 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
            Conversations
          </p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <StaffPortalLoading portal="forge" message="Loading inbox…" className="min-h-[12rem] py-8" />
          ) : threads.length === 0 ? (
            <p className="px-4 py-8 text-sm leading-relaxed text-slate-500">
              No messages yet. When someone emails info@pearzen.tech, the thread will appear here.
            </p>
          ) : (
            threads.map((thread) => {
              const active = thread.id === selectedId;
              const productCode = resolveSuggestedProductCode({
                subject: thread.subject,
                storedCode: thread.suggestedProductCode,
              });
              const productLabel = inquiryProductLabel(productCode);

              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setSelectedId(thread.id)}
                  className={`w-full border-b border-slate-800/70 px-4 py-4 text-left transition-colors ${
                    active ? 'bg-indigo-500/10' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-white">
                      {thread.visitorName ?? thread.visitorEmail}
                    </p>
                    <span className="shrink-0 text-[10px] text-slate-500">
                      {formatWhen(thread.lastMessageAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs font-medium text-slate-400">{thread.subject}</p>
                  {productLabel ? (
                    <span className="mt-2 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                      {productLabel}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#111118]">
        {!selectedThread ? (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-slate-500">
            Select a conversation to read and reply.
          </div>
        ) : (
          <>
            <div className="border-b border-slate-800 px-6 py-4">
              <p className="text-lg font-bold text-white">{selectedThread.subject}</p>
              <p className="mt-1 text-sm text-slate-400">
                {selectedThread.visitorName
                  ? `${selectedThread.visitorName} · ${selectedThread.visitorEmail}`
                  : selectedThread.visitorEmail}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-wider text-indigo-400">
                Replies send from info@pearzen.tech
              </p>
            </div>

            <div className="border-b border-slate-800 bg-[#0d0d12] px-6 py-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">
                  Commerce
                </p>
                {suggestedProductCode ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Detected: {inquiryProductLabel(suggestedProductCode as ForgeInquiryProductCode)}
                  </span>
                ) : null}
              </div>

              {commerceMessage ? (
                <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
                  {commerceMessage}
                </p>
              ) : null}

              {linkedPurchases.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Linked purchases
                  </p>
                  {linkedPurchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#111118] px-3 py-2 text-xs"
                    >
                      <span className="font-bold text-white">{purchase.productName}</span>
                      <span className="text-slate-400">{formatLkr(purchase.priceLkr)}</span>
                      <Link
                        href="/forge/commerce/invoices"
                        className="font-bold uppercase tracking-wider text-amber-400 hover:text-white"
                      >
                        Invoices →
                      </Link>
                    </div>
                  ))}
                </div>
              ) : null}

              {commerceProducts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Product</span>
                    <select
                      value={productId}
                      onChange={(e) => {
                        setProductId(e.target.value);
                        const p = commerceProducts.find((x) => x.id === e.target.value);
                        if (p) setPriceLkr(String(p.basePriceLkr));
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-sm text-white"
                    >
                      {commerceProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-slate-500">
                      Price (LKR)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceLkr}
                      onChange={(e) => setPriceLkr(e.target.value)}
                      className="w-full md:w-32 rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleRecordPurchase}
                    disabled={isPending || !productId}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-amber-500 disabled:opacity-50"
                  >
                    Record purchase
                  </button>
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500">
                <input
                  type="checkbox"
                  checked={sendInvoice}
                  onChange={(e) => setSendInvoice(e.target.checked)}
                  className="rounded border-slate-600"
                />
                Email invoice + post confirmation in this thread
              </label>

              {selectedProduct ? (
                <p className="text-[10px] text-slate-600">
                  Default list price:{' '}
                  {selectedProduct.basePriceLkr > 0
                    ? formatLkr(selectedProduct.basePriceLkr)
                    : 'Quote-based'}
                </p>
              ) : null}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {messages.map((message) => {
                const outbound = message.direction === 'outbound';
                return (
                  <div
                    key={message.id}
                    className={`max-w-3xl rounded-2xl border px-4 py-3 ${
                      outbound
                        ? 'ml-auto border-indigo-500/30 bg-indigo-500/10'
                        : 'border-slate-700 bg-[#0a0a0e]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        {outbound
                          ? message.operatorEmail === 'forge-commerce'
                            ? 'Forge Commerce · info@pearzen.tech'
                            : 'You · info@pearzen.tech'
                          : message.fromEmail}
                      </span>
                      <span>{formatWhen(message.createdAt)}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                      {message.bodyText?.trim() || '(No plain-text body)'}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-800 px-6 py-4">
              {error ? (
                <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {error}
                </p>
              ) : null}
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                placeholder="Write a reply…"
                className="w-full rounded-2xl border border-slate-700 bg-[#0a0a0e] px-4 py-3 text-sm text-slate-100 outline-none ring-indigo-500/40 focus:ring-2"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Latest: {messagePreview(messages[messages.length - 1])}
                </p>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isPending || !reply.trim()}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
