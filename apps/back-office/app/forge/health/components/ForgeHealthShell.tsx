import Link from 'next/link';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/forge/health', label: 'Overview' },
  { href: '/forge/health/tenants', label: 'Tenants' },
  { href: '/forge/health/partners', label: 'Partners' },
] as const;

type ForgeHealthShellProps = {
  title: string;
  subtitle: string;
  activePath: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function ForgeHealthShell({
  title,
  subtitle,
  activePath,
  children,
  actions,
}: ForgeHealthShellProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/forge"
            className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-indigo-300"
          >
            ← Forge home
          </Link>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      <nav className="flex flex-wrap gap-2">
        {NAV.map((item) => {
          const active = activePath === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full border px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                active
                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                  : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

export function ForgeHealthKpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-500/20 bg-emerald-500/5'
      : tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/5'
        : tone === 'danger'
          ? 'border-rose-500/20 bg-rose-500/5'
          : 'border-slate-800 bg-[#111118]';

  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function formatHealthTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
