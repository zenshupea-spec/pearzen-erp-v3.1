'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, CreditCard, Play, Timer } from 'lucide-react';

import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import {
  getCafeFrontOrders,
  getCafePrepAvgStats,
  updateCafeOrderStatus,
  type CafeFrontOrder,
  type CafePrepAvgStat,
} from '../../app/cafe-front/actions';
import type { CafeShiftGate } from '../../lib/cafe-front-shift';
import Link from 'next/link';
import { CAFE_FRONT_CHECKIN_PATH } from '../../app/cafe-front/cafe-front-nav';

function statusLabel(order: CafeFrontOrder): string {
  if (order.status === 'PLACED' && order.paymentStatus === 'pending') {
    if (order.paymentMethod === 'cash_at_counter') return 'Pay at counter';
    return 'Awaiting card payment';
  }
  if (order.status === 'PLACED') return 'Awaiting payment';
  if (order.status === 'PAYMENT_RECEIVED') {
    return order.paymentMethod === 'cash_at_counter' ? 'Cash received · ready to prep' : 'Card paid · ready to prep';
  }
  if (order.status === 'PREPARING') return 'In preparation';
  if (order.status === 'READY') return 'Ready for pickup';
  return order.status;
}

export function OrderQueuePanel({ shiftGate }: { shiftGate: CafeShiftGate }) {
  const [orders, setOrders] = useState<CafeFrontOrder[]>([]);
  const [stats, setStats] = useState<CafePrepAvgStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const reload = () => {
    void Promise.all([getCafeFrontOrders(), getCafePrepAvgStats()]).then(([rows, prep]) => {
      setOrders(rows);
      setStats(prep);
      setLoading(false);
    });
  };

  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const runAction = (orderId: string, action: 'payment_received' | 'start_prep' | 'mark_ready' | 'complete') => {
    startTransition(async () => {
      const result = await updateCafeOrderStatus(orderId, action);
      if (result.ok) reload();
      else if (result.error) alert(result.error);
    });
  };

  if (!shiftGate.canAcceptOrders) {
    return (
      <ExecutiveGlassCard className="border-amber-200/80 bg-amber-50/50 p-6 text-center">
        <p className="text-sm font-bold text-amber-900">Orders locked until shift check-in</p>
        <p className="mt-2 text-xs text-amber-800">
          Complete a GPS + selfie check-in at the café site before accepting customer orders. HR verifies
          your selfie after check-in.
        </p>
        <Link
          href={CAFE_FRONT_CHECKIN_PATH}
          className="mt-4 inline-flex rounded-xl bg-amber-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white"
        >
          Start shift check-in
        </Link>
      </ExecutiveGlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <ExecutiveGlassCard className="overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
          <h2 className="text-lg font-bold uppercase text-slate-800">Customer Order Queue</h2>
          <p className="mt-1 text-xs text-slate-500">
            Sorted first-come-first-served · payment → prep → ready · prep time tracked per barista
          </p>
        </div>

        <div className="space-y-3 p-5">
          {loading ? (
            <p className="text-center text-sm text-slate-500">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200/80 px-4 py-8 text-center text-xs text-slate-500">
              No active orders — customer menu orders appear here in queue order.
            </p>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Queue #{order.queueNumber} · {order.fulfillmentType}
                    </p>
                    <p className="mt-1 text-base font-bold text-slate-900">{order.customerName}</p>
                    <p className="text-xs text-slate-500">{order.customerPhone}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase text-indigo-700">
                      {statusLabel(order)}
                    </p>
                    {order.acceptedByName ? (
                      <p className="mt-1 text-[10px] text-slate-500">
                        Accepted by {order.acceptedByName}
                        {order.prepSeconds ? ` · ${order.prepSeconds}s prep` : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-900">
                      LKR {order.totalLkr.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(order.placedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-700">
                  {order.items.map((item, idx) => (
                    <li key={`${order.id}-${idx}`}>
                      {item.qty}× {item.name} — LKR {item.unitPriceLkr.toLocaleString()}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap gap-2">
                  {order.status === 'PLACED' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(order.id, 'payment_received')}
                      className="inline-flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white"
                    >
                      <CreditCard className="h-3 w-3" />
                      {order.paymentMethod === 'cash_at_counter'
                        ? 'Cash received'
                        : order.paymentStatus === 'pending'
                          ? 'Mark card paid'
                          : 'Payment received'}
                    </button>
                  ) : null}
                  {['PLACED', 'PAYMENT_RECEIVED'].includes(order.status) ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(order.id, 'start_prep')}
                      className="inline-flex items-center gap-1 rounded-xl border border-sky-300 bg-sky-600 px-3 py-2 text-[10px] font-black uppercase text-white"
                    >
                      <Play className="h-3 w-3" />
                      Start making
                    </button>
                  ) : null}
                  {order.status === 'PREPARING' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(order.id, 'mark_ready')}
                      className="inline-flex items-center gap-1 rounded-xl border border-violet-300 bg-violet-600 px-3 py-2 text-[10px] font-black uppercase text-white"
                    >
                      <Timer className="h-3 w-3" />
                      Mark ready
                    </button>
                  ) : null}
                  {order.status === 'READY' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(order.id, 'complete')}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-800 px-3 py-2 text-[10px] font-black uppercase text-white"
                    >
                      <Check className="h-3 w-3" />
                      Handed off
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </ExecutiveGlassCard>

      {stats.length > 0 ? (
        <ExecutiveGlassCard className="overflow-hidden">
          <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
            <h3 className="text-sm font-bold uppercase text-slate-800">Avg prep time (30 days)</h3>
          </div>
          <div className="overflow-x-auto p-5">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="pb-2">Item</th>
                  <th className="pb-2">Staff</th>
                  <th className="pb-2 text-right">Avg</th>
                  <th className="pb-2 text-right">Samples</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.slice(0, 12).map((row) => (
                  <tr key={`${row.menuItemId}-${row.employeeId}`}>
                    <td className="py-2 font-semibold text-slate-800">{row.menuItemName}</td>
                    <td className="py-2 text-slate-600">{row.employeeName}</td>
                    <td className="py-2 text-right font-mono font-bold text-slate-900">
                      {row.avgPrepSeconds}s
                    </td>
                    <td className="py-2 text-right text-slate-500">{row.sampleCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ExecutiveGlassCard>
      ) : null}
    </div>
  );
}
