'use client';

import { useMemo, useState } from 'react';

import {
  placeCustomerOrder,
  type FulfillmentType,
  type PublicMenuBranding,
  type PublicMenuItem,
} from '../lib/menu-api';

type OrderConfirmation = {
  choice: FulfillmentType;
  name: string;
  phone: string;
  address?: string;
  totalLkr: number;
  itemCount: number;
};

const FULFILLMENT_OPTIONS: Array<{ id: FulfillmentType; label: string; hint: string }> = [
  { id: 'dine-in', label: 'Dine-in', hint: 'Eat at the café' },
  { id: 'takeout', label: 'Takeout', hint: 'Pick up at counter' },
  { id: 'delivery', label: 'Delivery', hint: 'We bring it to you' },
];

function groupMenuItems(items: PublicMenuItem[]) {
  const byCategory = new Map<string, PublicMenuItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  return [...byCategory.entries()]
    .sort((a, b) => (a[1][0]?.categorySort ?? 0) - (b[1][0]?.categorySort ?? 0))
    .map(([category, rows]) => ({ category, rows }));
}

export function CustomerMenu({
  companyId,
  items,
  branding,
  initialError,
}: {
  companyId: string | null;
  items: PublicMenuItem[];
  branding: PublicMenuBranding;
  initialError: string | null;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [modalStep, setModalStep] = useState<'choice' | 'details'>('choice');
  const [pendingChoice, setPendingChoice] = useState<FulfillmentType | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderConfirmed, setOrderConfirmed] = useState<OrderConfirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(initialError);

  const grouped = useMemo(() => groupMenuItems(items), [items]);

  const priceById = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.id, item.priceLkr);
    return map;
  }, [items]);

  const cartTotal = useMemo(
    () =>
      Object.entries(cart).reduce(
        (sum, [id, qty]) => sum + (priceById.get(id) ?? 0) * qty,
        0,
      ),
    [cart, priceById],
  );

  const cartCount = useMemo(
    () => Object.values(cart).reduce((sum, qty) => sum + qty, 0),
    [cart],
  );

  const adjustQty = (itemId: string, delta: number) => {
    setOrderConfirmed(null);
    setCart((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const resetOrderModal = () => {
    setShowOrderModal(false);
    setModalStep('choice');
    setPendingChoice(null);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setSubmitError(null);
  };

  const confirmOrderDetails = async () => {
    if (!pendingChoice || !companyId) return;
    const name = customerName.trim();
    const phone = customerPhone.trim();
    const address = deliveryAddress.trim();
    if (!name || !phone) return;
    if (pendingChoice === 'delivery' && !address) return;

    const orderItems = Object.entries(cart).map(([id, qty]) => {
      const row = items.find((item) => item.id === id);
      return {
        menuItemId: id,
        name: row?.name ?? 'Item',
        qty,
        unitPriceLkr: priceById.get(id) ?? 0,
      };
    });

    setSubmitting(true);
    setSubmitError(null);
    const result = await placeCustomerOrder({
      companyId,
      fulfillmentType: pendingChoice,
      customerName: name,
      customerPhone: phone,
      deliveryAddress: pendingChoice === 'delivery' ? address : undefined,
      items: orderItems,
      totalLkr: cartTotal,
    });
    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error ?? 'Could not place order. Please try again.');
      return;
    }

    setOrderConfirmed({
      choice: pendingChoice,
      name,
      phone,
      address: pendingChoice === 'delivery' ? address : undefined,
      totalLkr: cartTotal,
      itemCount: cartCount,
    });
    setCart({});
    resetOrderModal();
  };

  const fulfillmentLabel = (choice: FulfillmentType) => {
    if (choice === 'dine-in') return 'Dine-in';
    if (choice === 'takeout') return 'Takeout';
    return 'Delivery';
  };

  const canConfirmDetails =
    customerName.trim().length > 0 &&
    customerPhone.trim().length > 0 &&
    (pendingChoice !== 'delivery' || deliveryAddress.trim().length > 0);

  const headerStyle = branding.coverUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.35), rgba(15,23,42,0.55)), url(${branding.coverUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {
        background: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)',
      };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-[#fdfbf7] shadow-xl">
      <header className="relative shrink-0 px-5 pb-6 pt-8 text-center" style={headerStyle}>
        <div className="flex justify-end">
          <span
            className="rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md"
            style={{ color: branding.coverTextColor }}
          >
            Open now
          </span>
        </div>
        <div className="mx-auto mt-2 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-white/80 bg-white shadow-lg">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-full w-full object-contain p-2" />
          ) : (
            <span className="text-2xl">☕</span>
          )}
        </div>
        <h1
          className="mt-3 text-2xl font-black tracking-wide"
          style={{ color: branding.coverTextColor }}
        >
          {branding.cafeName}
        </h1>
        {!orderConfirmed && cartCount === 0 ? (
          <p className="mt-1 text-sm font-medium" style={{ color: branding.coverTextColor }}>
            Tap + beside any item, then place your order
          </p>
        ) : null}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {submitError && !showOrderModal ? (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {submitError}
          </p>
        ) : null}

        {orderConfirmed ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center">
            <p className="text-sm font-bold text-emerald-900">
              {fulfillmentLabel(orderConfirmed.choice)} order placed for {orderConfirmed.name}
            </p>
            <p className="mt-1 text-xs text-emerald-800">
              LKR {orderConfirmed.totalLkr.toLocaleString()} · {orderConfirmed.itemCount} item
              {orderConfirmed.itemCount === 1 ? '' : 's'} · {orderConfirmed.phone}
            </p>
            {orderConfirmed.address ? (
              <p className="mt-1 text-xs text-emerald-700">{orderConfirmed.address}</p>
            ) : null}
            <p className="mt-2 text-xs text-emerald-700">
              Your order is in the café queue — staff will confirm payment and start preparing.
            </p>
          </div>
        ) : null}

        {grouped.length === 0 ? (
          <p className="py-12 text-center text-sm text-stone-500">
            {initialError ?? 'No menu items published yet. Ask staff to sync items to the live menu.'}
          </p>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ category, rows }) => (
              <section key={category}>
                <h2 className="mb-2 text-center text-sm font-black uppercase tracking-[0.2em] text-emerald-900">
                  {category}
                </h2>
                <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white/80">
                  {rows.map((item) => {
                    const qty = cart[item.id] ?? 0;
                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 px-3 py-3"
                        style={qty > 0 ? { backgroundColor: 'rgba(16,185,129,0.08)' } : undefined}
                      >
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-lg">
                            ☕
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-stone-800">{item.name}</p>
                          <p className="text-sm font-bold text-emerald-800">
                            LKR {item.priceLkr.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => adjustQty(item.id, -1)}
                            disabled={qty === 0}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                            aria-label={`Remove one ${item.name}`}
                          >
                            −
                          </button>
                          <span className="min-w-[1.25rem] text-center text-sm font-bold">{qty}</span>
                          <button
                            type="button"
                            onClick={() => adjustQty(item.id, 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-white hover:bg-emerald-800"
                            aria-label={`Add one ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-stone-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Your order</p>
            <p className="text-2xl font-black text-stone-900">LKR {cartTotal.toLocaleString()}</p>
            <p className="text-xs text-stone-500">
              {cartCount > 0 ? `${cartCount} item${cartCount === 1 ? '' : 's'} selected` : 'Add items above'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (cartCount === 0) return;
              setShowOrderModal(true);
              setModalStep('choice');
            }}
            disabled={cartCount === 0 || !companyId}
            className="rounded-full bg-emerald-700 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            Place order
          </button>
        </div>
      </footer>

      {showOrderModal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={resetOrderModal}
          role="presentation"
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="border-b bg-gradient-to-br from-emerald-50 to-stone-50 px-4 py-4">
              <button
                type="button"
                onClick={resetOrderModal}
                className="float-right rounded-lg px-2 py-1 text-stone-400 hover:bg-white hover:text-stone-700"
                aria-label="Close"
              >
                ✕
              </button>
              <p className="pr-8 text-sm font-black text-stone-900">
                {modalStep === 'choice' ? 'How would you like your order?' : 'Your contact details'}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {modalStep === 'choice'
                  ? `Choose dine-in, takeout, or delivery for ${cartCount} item${cartCount === 1 ? '' : 's'}.`
                  : `Name and phone required${pendingChoice === 'delivery' ? ', plus delivery address' : ''}.`}
              </p>
            </div>

            {modalStep === 'choice' ? (
              <div className="grid grid-cols-3 gap-2 p-4">
                {FULFILLMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPendingChoice(opt.id);
                      setModalStep('details');
                    }}
                    className="rounded-xl border border-stone-200 bg-white px-2 py-3 text-center transition hover:border-emerald-400 hover:bg-emerald-50"
                  >
                    <p className="text-xs font-bold text-stone-900">{opt.label}</p>
                    <p className="mt-1 text-[10px] text-stone-500">{opt.hint}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3 p-4">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Name
                  </span>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                    placeholder="Your name"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Phone
                  </span>
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                    placeholder="07X XXX XXXX"
                    inputMode="tel"
                  />
                </label>
                {pendingChoice === 'delivery' ? (
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                      Delivery address
                    </span>
                    <textarea
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Street, area, landmarks"
                    />
                  </label>
                ) : null}
                {submitError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {submitError}
                  </p>
                ) : null}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setModalStep('choice')}
                    className="flex-1 rounded-xl border border-stone-200 py-2.5 text-xs font-bold uppercase text-stone-600"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmOrderDetails()}
                    disabled={!canConfirmDetails || submitting}
                    className="flex-1 rounded-xl bg-emerald-700 py-2.5 text-xs font-bold uppercase text-white disabled:bg-stone-300"
                  >
                    {submitting ? 'Sending…' : 'Confirm order'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
