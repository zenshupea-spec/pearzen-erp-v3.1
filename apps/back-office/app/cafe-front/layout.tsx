import type { ReactNode } from 'react';

export default function CafeFrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-slate-50 text-slate-900 antialiased">
      <main className="min-h-screen">{children}</main>
    </div>
  );
}
