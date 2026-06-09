import type { ReactNode } from 'react';

export default function CafeFrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-slate-300 text-slate-900 antialiased">
      <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col overflow-hidden border-x border-slate-300/80 bg-white shadow-[0_0_60px_-12px_rgba(15,23,42,0.25)]">
        {children}
      </main>
    </div>
  );
}
