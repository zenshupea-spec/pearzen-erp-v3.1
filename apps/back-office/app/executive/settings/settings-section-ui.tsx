'use client';

import type { ElementType, ReactNode } from 'react';
import { CheckCircle2, Clock, Save } from 'lucide-react';
import type { SettingsSectionAudit } from './settings-traceability-actions';
import type { SettingsSectionId } from './settings-section-types';

export function SettingsTraceability({
  audit,
}: {
  sectionId?: SettingsSectionId;
  audit?: SettingsSectionAudit;
}) {
  return (
    <p className="text-[10px] font-medium text-slate-400 flex items-center gap-1 mt-1">
      <Clock className="h-3 w-3 flex-shrink-0" />
      {audit?.editedAt ? (
        <>
          Last edited by: {audit.actorLabel} — {audit.editedAt}
        </>
      ) : (
        'No saved edit history yet'
      )}
    </p>
  );
}

export function SectionSaveButton({
  saving,
  saved,
  disabled,
  onClick,
  label = 'Save',
}: {
  saving?: boolean;
  saved?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || saving}
      className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {saved && !saving ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      {saving ? 'Saving…' : saved ? 'Saved' : label}
    </button>
  );
}

export function SettingsCardHeader({
  icon: Icon,
  iconClassName,
  title,
  sub,
  sectionId,
  audit,
  saving,
  saved,
  onSave,
  extra,
}: {
  icon: ElementType;
  iconClassName: string;
  title: string;
  sub: string;
  sectionId: SettingsSectionId;
  audit?: SettingsSectionAudit;
  saving?: boolean;
  saved?: boolean;
  onSave: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border ${iconClassName}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <p className="text-sm font-medium text-slate-600">{sub}</p>
          <SettingsTraceability sectionId={sectionId} audit={audit} />
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {extra}
        <SectionSaveButton saving={saving} saved={saved} onClick={onSave} />
      </div>
    </div>
  );
}
