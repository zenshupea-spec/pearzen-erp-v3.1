import { Suspense } from 'react';

import PearsProfileClient from './PearsProfileClient';

export default function PearsProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-slate-100 px-6 py-16">
          <p className="animate-pulse text-center text-sm text-slate-500">Loading your PEARS shop…</p>
        </div>
      }
    >
      <PearsProfileClient />
    </Suspense>
  );
}
