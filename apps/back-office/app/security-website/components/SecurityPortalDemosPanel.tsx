'use client';

import { useState } from 'react';

import SecurityClientPortalPreview from './SecurityClientPortalPreview';
import SecurityGuardPortalPreview from './SecurityGuardPortalPreview';
import SecuritySmPortalPreview from './SecuritySmPortalPreview';

const TABS = [
  { id: 'guard', label: 'Guard app' },
  { id: 'sm', label: 'SM app' },
  { id: 'client', label: 'Client portal' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SecurityPortalDemosPanel() {
  const [active, setActive] = useState<TabId>('guard');

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 p-6 md:p-8 lg:min-h-[520px]">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-yellow-400">
        How operations run
      </p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
        Guards check in on site, supervisors audit visits, and clients see live proof — all on one
        platform.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
              active === tab.id
                ? 'bg-yellow-400 text-slate-950'
                : 'border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="@container/preview mt-8 min-h-0 flex-1">
        <div className="flex h-full w-full items-center justify-center">
          {active === 'guard' ? (
            <SecurityGuardPortalPreview size="fill" showDemoLabel={false} />
          ) : null}
          {active === 'sm' ? <SecuritySmPortalPreview size="fill" showDemoLabel={false} /> : null}
          {active === 'client' ? (
            <SecurityClientPortalPreview showDemoLabel={false} size="fill" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
