import type { ReactNode } from 'react';

/**
 * MD/OD Executive Vault canvas — PRD V6: light dotted grid, ambient green glows.
 */
export function ExecutiveVaultShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#eef2f6] text-slate-900 antialiased md:h-screen">
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
        className="pointer-events-none absolute -top-40 right-[-8%] h-[min(520px,85vw)] w-[min(520px,85vw)] rounded-full blur-[100px]"
        style={{ backgroundColor: 'var(--cvs-glow, rgba(52, 211, 153, 0.28))' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[26%] left-[-20%] h-[440px] w-[440px] rounded-full blur-[92px]"
        style={{ backgroundColor: 'var(--cvs-glow-teal, rgba(45, 212, 191, 0.22))' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-12%] right-[18%] h-[400px] w-[400px] rounded-full blur-[88px]"
        style={{ backgroundColor: 'var(--cvs-glow-lime, rgba(163, 230, 53, 0.18))' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[55%] right-[-5%] h-[280px] w-[280px] rounded-full blur-[70px]"
        style={{ backgroundColor: 'var(--cvs-glow, rgba(16, 185, 129, 0.15))' }}
      />
      <div className="relative z-10 flex h-full min-h-0 flex-col">{children}</div>
    </div>
  );
}

/** Frosted glass panel — dark typography on light frosted surface (PRD). */
export function ExecutiveGlassCard({
  children,
  className = '',
  id,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  onClick?: () => void;
}) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-white/75 bg-white/55 shadow-[0_12px_48px_-14px_rgba(15,23,42,0.12)] backdrop-blur-2xl backdrop-saturate-[1.35] ring-1 ring-slate-900/[0.045] ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
