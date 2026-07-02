'use client';

import { CheckCircle2, ChevronDown, Lock, Save } from 'lucide-react';

import {
  PORTAL_RBAC_PORTALS,
  type PortalAccessLevel,
  type PortalRbacPortalId,
} from '../../../../../packages/portal-rbac';
import type { StaffCommandCenterStaffRow } from './staff-command-center-actions';

export const RBAC_ACCESS_META: Record<
  PortalAccessLevel,
  { label: string; cls: string; dotCls: string; selectCls: string }
> = {
  FULL: {
    label: 'Full Access',
    cls: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-900',
    dotCls: 'bg-emerald-500',
    selectCls:
      'border-emerald-200/80 bg-emerald-50/80 text-emerald-900 focus:ring-emerald-500/40',
  },
  READ: {
    label: 'Read Only',
    cls: 'border-amber-200/80 bg-amber-50/80 text-amber-900',
    dotCls: 'bg-amber-400',
    selectCls: 'border-amber-200/80 bg-amber-50/80 text-amber-900 focus:ring-amber-500/40',
  },
  NONE: {
    label: 'No Access',
    cls: 'border-slate-200/80 bg-slate-100/80 text-slate-500',
    dotCls: 'bg-slate-300',
    selectCls: 'border-slate-200/80 bg-slate-50/80 text-slate-500 focus:ring-slate-400/40',
  },
};

const PORTAL_RBAC_SECTIONS = (() => {
  const order: string[] = [];
  const bySection = new Map<string, typeof PORTAL_RBAC_PORTALS>();
  for (const portal of PORTAL_RBAC_PORTALS) {
    if (!bySection.has(portal.section)) {
      order.push(portal.section);
      bySection.set(portal.section, []);
    }
    bySection.get(portal.section)!.push(portal);
  }
  return order.map((label) => ({
    label,
    portals: bySection.get(label)!,
  }));
})();

function accessLevelShort(level: PortalAccessLevel): string {
  if (level === 'FULL') return 'Full';
  if (level === 'READ') return 'Read';
  return 'None';
}

export function StaffCommandCenterRbacBlock({
  person,
  getAccessLevel,
  onAccessChange,
}: {
  person: StaffCommandCenterStaffRow;
  getAccessLevel: (portalId: PortalRbacPortalId) => PortalAccessLevel;
  onAccessChange: (portalId: PortalRbacPortalId, level: PortalAccessLevel) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200/70 bg-white/50 p-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
          Module access
        </p>
        {person.isLocked ? (
          <p className="mt-1 flex items-start gap-1 text-[10px] font-semibold leading-relaxed text-violet-700">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            System-locked for {person.rank} — values reflect rank policy.
          </p>
        ) : null}
      </div>

      {PORTAL_RBAC_SECTIONS.map((section) => (
        <div key={section.label} className="space-y-2">
          <p className="border-b border-slate-200/60 pb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
            {section.label}
          </p>
          <ul className="space-y-2">
            {section.portals.map((portal) => {
              const level = getAccessLevel(portal.id);
              const meta = RBAC_ACCESS_META[level];
              return (
                <li
                  key={portal.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-slate-100/80 bg-white/70 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-bold text-slate-800">
                      {portal.label}
                    </p>
                    <p className="truncate text-[9px] font-medium text-slate-500">
                      {portal.sub}
                    </p>
                  </div>
                  {person.isLocked ? (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider opacity-70 ${meta.cls}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotCls}`} />
                      {accessLevelShort(level)}
                    </span>
                  ) : (
                    <div className="relative shrink-0">
                      <select
                        value={level}
                        onChange={(event) =>
                          onAccessChange(
                            portal.id,
                            event.target.value as PortalAccessLevel,
                          )
                        }
                        className={`appearance-none rounded-lg border py-1 pl-2 pr-5 text-[9px] font-black uppercase tracking-wider shadow-sm transition-all focus:outline-none focus:ring-2 ${meta.selectCls}`}
                      >
                        <option value="FULL">Full</option>
                        <option value="READ">Read</option>
                        <option value="NONE">None</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 opacity-60" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function StaffCommandCenterRbacSaveFooter({
  saving,
  saved,
  error,
  disabled,
  onSave,
}: {
  saving: boolean;
  saved: boolean;
  error: string | null;
  disabled: boolean;
  onSave: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-slate-200/80 bg-slate-50/95 px-6 py-4 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Access levels
            </span>
            {(
              Object.entries(RBAC_ACCESS_META) as [
                PortalAccessLevel,
                (typeof RBAC_ACCESS_META)[PortalAccessLevel],
              ][]
            ).map(([key, meta]) => (
              <span
                key={key}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[9px] font-black uppercase tracking-wider ${meta.cls}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dotCls}`} />
                {meta.label}
              </span>
            ))}
          </div>
          <p className="flex max-w-xl items-start gap-1.5 text-[11px] leading-relaxed text-slate-600">
            <Lock className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
            MD/OD, OM, and TM rows are system-locked. Changes apply on next sign-in and are
            logged to the audit trail.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {error ? (
            <span className="rounded-xl border border-rose-200/80 bg-rose-50/80 px-3 py-1.5 text-sm font-bold text-rose-800">
              {error}
            </span>
          ) : null}
          {saved ? (
            <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Permissions saved
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={disabled || saving}
            className="flex items-center gap-2 rounded-2xl bg-violet-700 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-violet-700/25 transition-all hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save all permissions'}
          </button>
        </div>
      </div>
    </div>
  );
}
