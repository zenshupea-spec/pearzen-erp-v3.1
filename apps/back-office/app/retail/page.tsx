import Link from 'next/link';
import { Package, Receipt, ShoppingBag, Store } from 'lucide-react';

import { fetchRetailDeskSummary } from './actions';

export const dynamic = 'force-dynamic';

export default async function RetailHubPage() {
  const summary = await fetchRetailDeskSummary();

  const cards = [
    {
      href: '/retail/inventory',
      label: 'Inventory',
      description: 'Product catalog, stock on hand, and reorder alerts.',
      stat: `${summary.productCount} products · ${summary.lowStockCount} low stock`,
      icon: Package,
    },
    {
      href: '/retail/checkout',
      label: 'Checkout',
      description: 'Counter cart and payment capture for walk-in sales.',
      stat: `${summary.openCarts} open cart${summary.openCarts === 1 ? '' : 's'}`,
      icon: ShoppingBag,
    },
    {
      href: '/retail/orders',
      label: 'Orders',
      description: 'Completed retail orders and line-item history.',
      stat: `LKR ${summary.todayOrderTotalLkr.toLocaleString('en-LK')} today`,
      icon: Receipt,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-4">
        <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
          <Store className="h-8 w-8 text-indigo-600" strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-600">
            Vertical add-on
          </p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Retail Desk</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Inventory, checkout, and order ledger for retail tenants. Enable or suspend this vertical
            from Forge → Module Provisioning.
          </p>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">{card.label}</h2>
              <p className="mt-2 text-sm text-slate-500">{card.description}</p>
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-indigo-700">
                {card.stat}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
