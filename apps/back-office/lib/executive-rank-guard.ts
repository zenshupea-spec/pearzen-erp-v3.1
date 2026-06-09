import type { RankPayEntry } from "../../../packages/rank-pay-matrix";

import {
  canManageExecutiveAccess,
  EXECUTIVE_RANKS,
  isExecutiveRank,
  normalizePortalRole,
} from "./portal-role-utils";

export type ExecutiveRank = (typeof EXECUTIVE_RANKS)[number];

export {
  canManageExecutiveAccess,
  EXECUTIVE_RANKS,
  isExecutiveRank,
} from "./portal-role-utils";

export function canViewMnrEmployee(
  viewerRole: string | null | undefined,
  employeeRank: string | null | undefined,
): boolean {
  if (canManageExecutiveAccess(viewerRole)) return true;
  return !isExecutiveRank(employeeRank);
}

export function canEditMnrEmployee(
  editorRole: string | null | undefined,
  employeeRank: string | null | undefined,
): boolean {
  const editor = normalizePortalRole(editorRole);
  if (!editor) return false;
  if (canManageExecutiveAccess(editor)) return true;
  return !isExecutiveRank(employeeRank);
}

export function filterRanksForEditor(
  matrix: RankPayEntry[],
  editorRole: string | null | undefined,
): RankPayEntry[] {
  if (canManageExecutiveAccess(editorRole)) return matrix;
  return matrix.filter((r) => !isExecutiveRank(r.rankCode));
}

export function assertCanAssignRank(
  editorRole: string | null | undefined,
  newRank: string | null | undefined,
): void {
  if (!isExecutiveRank(newRank)) return;
  if (!canManageExecutiveAccess(editorRole)) {
    throw new Error(
      "Only MD or OD can assign MD or OD rank.",
    );
  }
}

/**
 * Block HR / FM / OM from editing MD & OD MNR records or changing their portal credentials.
 * Only MD and OD may manage executive clearance (rank + work email).
 */
export function assertMnrEditAllowed(args: {
  editorRole: string | null | undefined;
  employeeRank: string | null | undefined;
  newRank?: string | null | undefined;
}): void {
  const editor = normalizePortalRole(args.editorRole);
  if (canManageExecutiveAccess(editor)) return;

  if (isExecutiveRank(args.newRank)) {
    throw new Error(
      "Only MD or OD can assign MD or OD rank.",
    );
  }

  if (isExecutiveRank(args.employeeRank)) {
    throw new Error(
      "MD and OD records can only be edited by MD or OD.",
    );
  }
}

export function assertCanChangeEmployeeStatus(
  editorRole: string | null | undefined,
  employeeRank: string | null | undefined,
): void {
  if (canManageExecutiveAccess(editorRole)) return;
  if (isExecutiveRank(employeeRank)) {
    throw new Error(
      "Only MD or OD can change status on MD or OD records.",
    );
  }
}
