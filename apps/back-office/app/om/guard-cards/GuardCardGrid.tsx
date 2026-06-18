'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Ban,
  Shield,
  TrendingDown,
  Clock,
  CalendarRange,
  CalendarX2,
  Wallet,
} from 'lucide-react';
import { blacklistGuard, type GuardCardDisplay } from './actions';
import BlacklistReasonModal from './BlacklistReasonModal';
import { CardBlacklistStrike } from './CardBlacklistStrike';
import { ratingTier } from './lib/rating';

const STRIKE_REMOVE_MS = 800;

type Tier = ReturnType<typeof ratingTier>;

const TIER_META: Record<
  Tier,
  { label: string; ring: string; badge: string; score: string; bar: string }
> = {
  gold: {
    label: 'Elite',
    ring: 'ring-emerald-400/60',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    score: 'text-emerald-700',
    bar: 'bg-emerald-500',
  },
  silver: {
    label: 'Pro',
    ring: 'ring-slate-300',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    score: 'text-slate-700',
    bar: 'bg-slate-500',
  },
  bronze: {
    label: 'Standard',
    ring: 'ring-orange-300/70',
    badge: 'bg-orange-50 text-orange-800 border-orange-200',
    score: 'text-orange-800',
    bar: 'bg-orange-500',
  },
  risk: {
    label: 'At risk',
    ring: 'ring-rose-300/80',
    badge: 'bg-rose-50 text-rose-800 border-rose-200',
    score: 'text-rose-700',
    bar: 'bg-rose-500',
  },
};

const METRICS: {
  key: keyof GuardCardDisplay['scores'];
  short: string;
  icon: typeof Shield;
  hint: (c: GuardCardDisplay) => string;
}[] = [
  {
    key: 'penalties',
    short: 'Pen.',
    icon: TrendingDown,
    hint: (c) =>
      `${c.penaltyCount12m} events · LKR ${Math.round(c.penaltyAmount12m).toLocaleString()} (12m)`,
  },
  {
    key: 'lateCheckIns',
    short: 'Late',
    icon: Clock,
    hint: (c) => `${c.lateCheckIns12m} late check-ins (12m)`,
  },
  {
    key: 'shiftVolume',
    short: 'Vol.',
    icon: CalendarRange,
    hint: (c) => `~${c.shiftsPerMonth} shifts/mo vs peers`,
  },
  {
    key: 'attendanceStreak',
    short: 'Miss',
    icon: CalendarX2,
    hint: (c) => `${c.maxConsecutiveMissedDays} max consecutive days missed`,
  },
  {
    key: 'deductions',
    short: 'Ded.',
    icon: Wallet,
    hint: (c) => `LKR ${Math.round(c.deductionTotal12m).toLocaleString()} deductions (12m)`,
  },
];

function MiniStat({
  label,
  value,
  icon: Icon,
  barClass,
  title,
}: {
  label: string;
  value: number;
  icon: typeof Shield;
  barClass: string;
  title: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <div className="mb-0.5 flex items-center justify-between gap-1">
        <span className="inline-flex min-w-0 items-center gap-0.5 truncate text-[9px] font-bold uppercase tracking-wide text-slate-500">
          <Icon className="h-2.5 w-2.5 shrink-0 text-slate-400" />
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-slate-700">
          {value}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{ width: `${Math.max(6, value)}%` }}
        />
      </div>
    </div>
  );
}

function GuardPerformanceCard({
  card,
  onBlacklisted,
  isDemo,
}: {
  card: GuardCardDisplay;
  onBlacklisted: () => void;
  isDemo?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [isStruck, setIsStruck] = useState(false);
  const tier = ratingTier(card.rating);
  const meta = TIER_META[tier];

  const handleBlacklist = (reason: string) => {
    startTransition(async () => {
      const res = await blacklistGuard(card.employeeId, reason);
      if ('error' in res && res.error) {
        alert(res.error);
        return;
      }
      setModalOpen(false);
      setIsStruck(true);
      window.setTimeout(() => {
        onBlacklisted();
      }, STRIKE_REMOVE_MS);
    });
  };

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm ring-1 transition-all ${
        isStruck
          ? 'pointer-events-none border-slate-300 ring-slate-200'
          : 'border-slate-200/90 ring-slate-100/80 hover:shadow-md'
      }`}
    >
      {isStruck && <CardBlacklistStrike />}

      <div className={isStruck ? 'opacity-50' : undefined}>
        <div className="flex gap-3 border-b border-slate-100 p-3">
          <div
            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-2 ${meta.ring}`}
          >
            {card.idPhotoUrl ? (
              <Image
                src={card.idPhotoUrl}
                alt={card.fullName}
                width={56}
                height={56}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Shield className="h-6 w-6 text-slate-300" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1">
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${meta.badge}`}
              >
                {meta.label}
              </span>
              <div className="text-right leading-none">
                <span className={`text-2xl font-black tabular-nums ${meta.score}`}>
                  {card.rating}
                </span>
                <span className="ml-0.5 text-[9px] font-bold text-slate-400">/100</span>
              </div>
            </div>
            <p className="mt-1 truncate text-sm font-black leading-tight text-slate-900">
              {card.fullName}
            </p>
            <p className="truncate text-[10px] font-semibold text-slate-500">
              {card.rank ?? '—'}
              {card.sector ? ` · ${card.sector}` : ''}
              {' · '}
              <span className="font-mono">{card.empNumber}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-2 px-3 py-2.5">
          {METRICS.map(({ key, short, icon, hint }) => (
            <MiniStat
              key={key}
              label={short}
              value={card.scores[key]}
              icon={icon}
              barClass={meta.bar}
              title={hint(card)}
            />
          ))}
          <div className="col-span-2 border-t border-slate-50 pt-1">
            <p className="text-center text-[8px] font-medium text-slate-400">
              Rolling 12-month composite · higher bar = better
            </p>
          </div>
        </div>
      </div>

      {!isStruck && (
        <div className="relative z-20 mt-auto border-t border-slate-100 bg-white px-2.5 py-2">
          {isDemo ? (
            <p className="text-center text-[8px] font-bold uppercase tracking-wider text-slate-400">
              Preview — blacklist off
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-slate-900 bg-slate-900 py-2 text-[9px] font-black uppercase tracking-widest text-white transition-colors hover:bg-slate-800"
            >
              <Ban className="h-3 w-3" />
              Blacklist
            </button>
          )}
        </div>
      )}

      <BlacklistReasonModal
        open={modalOpen}
        guardName={card.fullName}
        empNumber={card.empNumber}
        pending={pending}
        onClose={() => setModalOpen(false)}
        onConfirm={handleBlacklist}
      />

      {isStruck && (
        <p className="relative z-20 border-t border-slate-200 bg-slate-100 py-2 text-center text-[9px] font-black uppercase tracking-widest text-slate-700">
          Blacklisted
        </p>
      )}
    </article>
  );
}

export default function GuardCardGrid({
  initialCards,
  blacklistedCount,
  isDemo = false,
}: {
  initialCards: GuardCardDisplay[];
  blacklistedCount: number;
  isDemo?: boolean;
}) {
  const [cards, setCards] = useState(initialCards);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
        <p className="max-w-2xl text-xs leading-relaxed text-slate-600">
          Rolling 12-month composite score. Highest rated guards first. Blacklisted guards are
          struck from the board and listed under Blacklisted until MD approves removal.
        </p>
        <Link
          href="/om/guard-cards/blacklisted"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-800 hover:bg-rose-100"
        >
          <Ban className="h-3.5 w-3.5" />
          Blacklisted ({blacklistedCount})
        </Link>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No active guards to rank, or all guards are blacklisted.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {cards.map((card) => (
            <GuardPerformanceCard
              key={card.employeeId}
              card={card}
              isDemo={isDemo}
              onBlacklisted={() =>
                setCards((prev) => prev.filter((c) => c.employeeId !== card.employeeId))
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
