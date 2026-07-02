import Link from 'next/link';
import { CalendarDays, Package, Receipt, Scissors } from 'lucide-react';

import { fetchSalonDeskSummary } from './actions';

export const dynamic = 'force-dynamic';

export default async function SalonHubPage() {
  const summary = await fetchSalonDeskSummary();

  const cards = [
    {
      href: '/salon/bookings',
      label: 'Bookings',
      description: 'Schedule and triage client appointments.',
      stat: `${summary.upcomingAppointments} upcoming`,
      icon: CalendarDays,
    },
    {
      href: '/salon/pos',
      label: 'Point of Sale',
      description: 'Record service and retail sales at the counter.',
      stat: `LKR ${summary.todayPosTotalLkr.toLocaleString('en-LK')} today`,
      icon: Receipt,
    },
    {
      href: '/salon/catalog',
      label: 'Catalog',
      description: 'Manage services, retail products, and pricing.',
      stat: `${summary.serviceCount} services · ${summary.productCount} products`,
      icon: Package,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-4">
        <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
          <Scissors className="h-8 w-8 text-rose-600" strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-rose-600">
            Vertical add-on
          </p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Salon Desk</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Booking scheduler and product POS for salon tenants. Enable or suspend this vertical
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
              className="group rounded-2xl border border-rose-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">{card.label}</h2>
              <p className="mt-2 text-sm text-slate-500">{card.description}</p>
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-rose-700">
                {card.stat}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
