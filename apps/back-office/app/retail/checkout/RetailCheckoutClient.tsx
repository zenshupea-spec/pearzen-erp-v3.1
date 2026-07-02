'use client';

import { useEffect, useState, useTransition } from 'react';

import {
  checkoutRetailCart,
  ensureRetailOpenCart,
  fetchRetailProducts,
  updateRetailCart,
} from '../actions';
import type { RetailCartLineItem, RetailCartRow, RetailPaymentMethod, RetailProductRow } from '../../../lib/retail-types';

function formatMoney(value: number) {
  return `LKR ${value.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

export default function RetailCheckoutClient() {
  const [products, setProducts] = useState<RetailProductRow[]>([]);
  const [cart, setCart] = useState<RetailCartRow | null>(null);
  const [lineItems, setLineItems] = useState<RetailCartLineItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<RetailPaymentMethod>('cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    try {
      const [productRows, cartRow] = await Promise.all([
        fetchRetailProducts(),
        ensureRetailOpenCart(),
      ]);
      setProducts(productRows.filter((row) => row.isActive && row.stockOnHand > 0));
      setCart(cartRow);
      setLineItems(cartRow.lineItems);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load checkout');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addProduct = (product: RetailProductRow) => {
    setLineItems((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id
            ? {
                ...line,
                quantity: line.quantity + 1,
                lineTotalLkr: (line.quantity + 1) * line.unitPriceLkr,
              }
            : line,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPriceLkr: product.unitPriceLkr,
          lineTotalLkr: product.unitPriceLkr,
        },
      ];
    });
  };

  const total = lineItems.reduce((sum, line) => sum + line.lineTotalLkr, 0);

  const persistCart = async (nextLines: RetailCartLineItem[]) => {
    if (!cart) return;
    await updateRetailCart({
      cartId: cart.id,
      lineItems: nextLines,
      notes,
    });
  };

  const handleCheckout = () => {
    startTransition(async () => {
      setMessage(null);
      if (!cart) return;

      await persistCart(lineItems);
      const result = await checkoutRetailCart({
        cartId: cart.id,
        paymentMethod,
        customerName,
        customerPhone,
        notes,
      });

      if (!result.success) {
        setMessage(result.error ?? 'Checkout failed');
        return;
      }

      setMessage(`Order ${result.orderNumber} recorded.`);
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
      await load();
    });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">Checkout</h1>
        <p className="mt-1 text-sm text-slate-500">
          Counter cart {cart ? `· ${cart.cartCode}` : ''}
        </p>
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

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Add to cart</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addProduct(product)}
                className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-left text-sm hover:border-indigo-300"
              >
                <div className="font-bold text-slate-900">{product.name}</div>
                <div className="text-xs text-slate-500">
                  {formatMoney(product.unitPriceLkr)} · stock {product.stockOnHand}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Current cart</h2>
          <div className="mt-4 space-y-3">
            {lineItems.length === 0 ? (
              <p className="text-sm text-slate-500">Add products to begin checkout.</p>
            ) : (
              lineItems.map((line) => (
                <div key={line.productId} className="flex justify-between text-sm">
                  <span>
                    {line.productName} × {line.quantity}
                  </span>
                  <span className="font-semibold">{formatMoney(line.lineTotalLkr)}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-6 border-t border-slate-100 pt-4 text-lg font-black">
            {formatMoney(total)}
          </div>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer name"
            className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Customer phone"
            className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as RetailPaymentMethod)}
            className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="transfer">Transfer</option>
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Order notes"
            className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <button
            type="button"
            onClick={handleCheckout}
            disabled={isPending || lineItems.length === 0}
            className="mt-4 w-full rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
          >
            {isPending ? 'Processing…' : 'Complete checkout'}
          </button>
        </section>
      </div>
    </div>
  );
}
