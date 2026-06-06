import type { ReactNode } from 'react';

/**
 * MD/OD Executive Vault canvas — PRD V6: light dotted grid, ambient green glows.
 */
export function ExecutiveVaultShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#eef2f6] text-slate-900 antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.48]"
        style={{
          backgroundImage:
            'radial-gradient(rgb(148 163 184 / 0.42) 1.1px, transparent 1.1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-8%] h-[min(520px,85vw)] w-[min(520px,85vw)] rounded-full bg-emerald-400/28 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[26%] left-[-20%] h-[440px] w-[440px] rounded-full bg-teal-300/22 blur-[92px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-12%] right-[18%] h-[400px] w-[400px] rounded-full bg-lime-400/18 blur-[88px]"
      />
      <div className="pointer-events-none absolute top-[55%] right-[-5%] h-[280px] w-[280px] rounded-full bg-emerald-500/15 blur-[70px]" />
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  );
}

/** Frosted glass panel — dark typography on light frosted surface (PRD). */
export function ExecutiveGlassCard({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/75 bg-white/55 shadow-[0_12px_48px_-14px_rgba(15,23,42,0.12)] backdrop-blur-2xl backdrop-saturate-[1.35] ring-1 ring-slate-900/[0.045] ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
