'use client';

import { useEffect, useState, useTransition } from 'react';

import {
  fetchSalonPosTransactions,
  fetchSalonProducts,
  fetchSalonServices,
  recordSalonPosTransaction,
} from '../actions';
import type {
  SalonPaymentMethod,
  SalonPosLineItem,
  SalonPosTransactionRow,
  SalonProductRow,
  SalonServiceRow,
} from '../../../lib/salon-types';

function formatMoney(value: number) {
  return `LKR ${value.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

export default function SalonPosClient() {
  const [services, setServices] = useState<SalonServiceRow[]>([]);
  const [products, setProducts] = useState<SalonProductRow[]>([]);
  const [transactions, setTransactions] = useState<SalonPosTransactionRow[]>([]);
  const [lineItems, setLineItems] = useState<SalonPosLineItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<SalonPaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    try {
      const [serviceRows, productRows, txRows] = await Promise.all([
        fetchSalonServices(),
        fetchSalonProducts(),
        fetchSalonPosTransactions(),
      ]);
      setServices(serviceRows.filter((row) => row.isActive));
      setProducts(productRows.filter((row) => row.isActive));
      setTransactions(txRows);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load POS desk');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addService = (service: SalonServiceRow) => {
    setLineItems((prev) => [
      ...prev,
      {
        kind: 'service',
        itemId: service.id,
        name: service.name,
        quantity: 1,
        unitPriceLkr: service.priceLkr,
        lineTotalLkr: service.priceLkr,
      },
    ]);
  };

  const addProduct = (product: SalonProductRow) => {
    setLineItems((prev) => [
      ...prev,
      {
        kind: 'product',
        itemId: product.id,
        name: product.name,
        quantity: 1,
        unitPriceLkr: product.unitPriceLkr,
        lineTotalLkr: product.unitPriceLkr,
      },
    ]);
  };

  const total = lineItems.reduce((sum, line) => sum + line.lineTotalLkr, 0);

  const handleCheckout = () => {
    startTransition(async () => {
      setMessage(null);
      const result = await recordSalonPosTransaction({
        lineItems,
        paymentMethod,
        notes,
      });
      if (!result.success) {
        setMessage(result.error ?? 'Checkout failed');
        return;
      }
      setMessage(`Receipt ${result.receiptNumber} recorded.`);
      setLineItems([]);
      setNotes('');
      await load();
    });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">POS</h1>
        <p className="mt-1 text-sm text-slate-500">Counter sales for services and retail products.</p>
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
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Quick add</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => addService(service)}
                className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-left text-sm hover:border-rose-300"
              >
                <div className="font-bold text-slate-900">{service.name}</div>
                <div className="text-xs text-slate-500">{formatMoney(service.priceLkr)}</div>
              </button>
            ))}
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addProduct(product)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm hover:border-slate-300"
              >
                <div className="font-bold text-slate-900">{product.name}</div>
                <div className="text-xs text-slate-500">{formatMoney(product.unitPriceLkr)}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Current sale</h2>
          <div className="mt-4 space-y-3">
            {lineItems.length === 0 ? (
              <p className="text-sm text-slate-500">Add services or products to begin.</p>
            ) : (
              lineItems.map((line, index) => (
                <div key={`${line.itemId}-${index}`} className="flex justify-between text-sm">
                  <span>
                    {line.name} × {line.quantity}
                  </span>
                  <span className="font-semibold">{formatMoney(line.lineTotalLkr)}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-6 border-t border-slate-100 pt-4 text-lg font-black">
            {formatMoney(total)}
          </div>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as SalonPaymentMethod)}
            className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="transfer">Transfer</option>
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Receipt notes"
            className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          />
          <button
            type="button"
            onClick={handleCheckout}
            disabled={isPending || lineItems.length === 0}
            className="mt-4 w-full rounded-xl bg-rose-600 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
          >
            {isPending ? 'Recording…' : 'Complete sale'}
          </button>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold uppercase tracking-wider text-slate-500">
          Recent receipts
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Receipt</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  No POS transactions yet.
                </td>
              </tr>
            ) : (
              transactions.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-mono text-xs">{row.receiptNumber}</td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(row.totalLkr)}</td>
                  <td className="px-4 py-3 uppercase text-xs">{row.paymentMethod}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(row.createdAt).toLocaleString('en-LK')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
