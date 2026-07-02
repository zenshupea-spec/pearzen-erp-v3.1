'use client';

import {
  WEB_EDITOR_TAB_ACCENT,
  WEB_EDITOR_TAB_META,
  WEB_EDITOR_TAB_ORDER,
  type BulkEditorTabId,
} from '../../lib/bulk-roster-web-editor-spec';

export type BulkEditorTabsProps = {
  activeTab: BulkEditorTabId;
  onTabChange: (tabId: BulkEditorTabId) => void;
  rowCountForTab: (tabId: BulkEditorTabId) => number | null;
  isTabDirty: (tabId: BulkEditorTabId) => boolean;
};

export default function BulkEditorTabs({
  activeTab,
  onTabChange,
  rowCountForTab,
  isTabDirty,
}: BulkEditorTabsProps) {
  return (
    <nav
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200/70 bg-white/70 px-3 py-2 backdrop-blur-sm sm:px-5"
      aria-label="Workbook sheets"
    >
      {WEB_EDITOR_TAB_ORDER.map((tabId) => {
        const meta = WEB_EDITOR_TAB_META[tabId];
        const isActive = activeTab === tabId;
        const count = rowCountForTab(tabId);
        const dirty = isTabDirty(tabId);

        return (
          <button
            key={tabId}
            type="button"
            onClick={() => onTabChange(tabId)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all sm:px-4 ${
              isActive
                ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-200/80'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
            }`}
            style={
              isActive ? { boxShadow: `inset 0 -2px 0 0 ${WEB_EDITOR_TAB_ACCENT[tabId]}` } : undefined
            }
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="relative flex h-2 w-2 items-center justify-center" aria-hidden>
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: WEB_EDITOR_TAB_ACCENT[tabId] }}
              />
              {dirty ? (
                <span
                  className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white"
                  title="Unsaved changes on this sheet"
                />
              ) : null}
            </span>
            {meta.label}
            {count != null ? (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-slate-600">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
