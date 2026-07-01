import type { ReactNode } from 'react';

/** Mobile phone shell on vault canvas — shared by /cafe-front, /shalom-front, and logins. */
export default function CafeFrontDeviceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-[#eef2f6] text-slate-900 antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.42]"
        style={{
          backgroundImage:
            'radial-gradient(rgb(148 163 184 / 0.42) 1.1px, transparent 1.1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-20%] z-0 h-[min(360px,70vw)] w-[min(360px,70vw)] rounded-full blur-[88px]"
        style={{ backgroundColor: 'var(--cvs-glow)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-10%] left-[-25%] z-0 h-[280px] w-[280px] rounded-full blur-[80px]"
        style={{ backgroundColor: 'var(--cvs-glow-teal)' }}
      />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col overflow-hidden border-x border-slate-200/80 bg-white shadow-[0_0_60px_-12px_rgba(15,23,42,0.18)]">
        {children}
      </main>
    </div>
  );
}
