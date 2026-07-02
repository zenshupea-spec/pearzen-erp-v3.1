'use client';

import { useEffect, useState } from 'react';

import { fetchRetailOrders } from '../actions';
import type { RetailOrderRow } from '../../../lib/retail-types';

function formatMoney(value: number) {
  return `LKR ${value.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

export default function RetailOrdersClient() {
  const [orders, setOrders] = useState<RetailOrderRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchRetailOrders()
      .then(setOrders)
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Failed to load orders');
      });
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">Orders</h1>
        <p className="mt-1 text-sm text-slate-500">Completed retail checkout history.</p>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </div>
      ) : null}

      <section className="space-y-4">
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm">
            No orders yet.
          </div>
        ) : (
          orders.map((order) => (
            <article
              key={order.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-slate-500">{order.orderNumber}</p>
                  <h2 className="text-lg font-bold text-slate-900">{formatMoney(order.totalLkr)}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {order.customerName ?? 'Walk-in'}
                    {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                  </p>
                </div>
                <div className="text-right text-xs uppercase tracking-wider text-slate-500">
                  <div>{order.status}</div>
                  <div className="mt-1 normal-case tracking-normal text-slate-400">
                    {new Date(order.createdAt).toLocaleString('en-LK')}
                  </div>
                </div>
              </div>
              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                {order.lines.map((line) => (
                  <li key={line.id} className="flex justify-between">
                    <span>
                      {line.productName} × {line.quantity}
                    </span>
                    <span className="font-medium">{formatMoney(line.lineTotalLkr)}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
