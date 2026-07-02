import type { ReactNode } from 'react';

/** Vault canvas for Invoice Desk — aligned with HQ / FM / HR portal family. */
export function InvoiceDeskShell({ children }: { children: ReactNode }) {
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
        className="pointer-events-none absolute -top-40 right-[-8%] z-0 h-[min(480px,80vw)] w-[min(480px,80vw)] rounded-full blur-[100px]"
        style={{ backgroundColor: 'var(--cvs-glow)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[30%] left-[-15%] z-0 h-[400px] w-[400px] rounded-full blur-[92px]"
        style={{ backgroundColor: 'var(--cvs-glow-teal)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-8%] right-[20%] z-0 h-[360px] w-[360px] rounded-full blur-[88px]"
        style={{ backgroundColor: 'var(--cvs-glow-lime)' }}
      />
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  );
}

/** Frosted panel for Invoice Desk — matches ExecutiveGlassCard weight. */
export function InvoiceDeskCard({
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
      className={`rounded-2xl border border-white/55 bg-white/55 shadow-[0_14px_40px_-12px_rgba(15,23,42,0.12)] backdrop-blur-2xl ring-1 ring-slate-200/50 ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/** Opaque panel for modals — avoids stacked blur washing out small type. */
export function InvoiceDeskModalCard({
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
      className={`rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_24px_-8px_rgba(15,23,42,0.15)] ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
