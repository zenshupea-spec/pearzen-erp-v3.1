'use client';

import { CheckCircle2, ClipboardCheck, Loader2, MapPin } from 'lucide-react';

import type { BulkEditorValidationIssue } from '../../lib/bulk-editor-validation';
import { formatBulkEditorValidationSummary } from '../../lib/bulk-editor-validation';
import { WEB_EDITOR_TAB_META, type BulkEditorTabId } from '../../lib/bulk-roster-web-editor-spec';

export type BulkEditorValidationPanelProps = {
  validating: boolean;
  issues: BulkEditorValidationIssue[];
  validated: boolean;
  onValidate: () => void;
  onJumpToIssue: (issue: BulkEditorValidationIssue) => void;
};

function issueLocationLabel(issue: BulkEditorValidationIssue): string {
  const parts: string[] = [];
  if (issue.tabId) {
    parts.push(WEB_EDITOR_TAB_META[issue.tabId].label);
  } else if (issue.sheetName) {
    parts.push(issue.sheetName);
  }
  if (issue.rowIndex != null) {
    parts.push(`row ${issue.rowIndex + 1}`);
  } else if (issue.excelRow != null) {
    parts.push(`Excel row ${issue.excelRow}`);
  }
  if (issue.columnKey) {
    parts.push(issue.columnKey);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Workbook';
}

export default function BulkEditorValidationPanel({
  validating,
  issues,
  validated,
  onValidate,
  onJumpToIssue,
}: BulkEditorValidationPanelProps) {
  const hasIssues = issues.length > 0;
  const canJump = (issue: BulkEditorValidationIssue) =>
    issue.tabId != null && issue.rowIndex != null;

  return (
    <div className="shrink-0 border-t border-slate-200/70 bg-slate-50/80 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">
              Validation
            </p>
            {validated && !hasIssues ? (
              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                <CheckCircle2 className="h-3 w-3" />
                Passed
              </span>
            ) : null}
            {validated && hasIssues ? (
              <span className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-800">
                {issues.length} issue{issues.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {validated
              ? formatBulkEditorValidationSummary(issues)
              : 'Run validation before applying changes to the live roster.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onValidate}
          disabled={validating}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-sky-800 shadow-sm hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {validating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ClipboardCheck className="h-3.5 w-3.5" />
          )}
          Validate
        </button>
      </div>

      {validated && hasIssues ? (
        <ul className="mt-3 max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-rose-200/80 bg-white/90 p-2">
          {issues.map((issue, index) => (
            <li key={`${issue.raw}-${index}`}>
              <button
                type="button"
                onClick={() => onJumpToIssue(issue)}
                disabled={!canJump(issue)}
                className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-rose-50 disabled:cursor-default disabled:opacity-80"
              >
                <MapPin
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                    canJump(issue) ? 'text-sky-600' : 'text-slate-300'
                  }`}
                />
                <span className="min-w-0">
                  <span className="block font-bold text-slate-800">{issueLocationLabel(issue)}</span>
                  <span className="block text-slate-600">{issue.message}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type { BulkEditorTabId };
