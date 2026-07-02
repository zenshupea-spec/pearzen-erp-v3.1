import { normalizePortalRole } from './portal-role-utils';

export const FORGE_EXECUTIVE_2FA_TARGETS = ['md', 'od'] as const;
export type ForgeExecutive2faTarget = (typeof FORGE_EXECUTIVE_2FA_TARGETS)[number];

export const FORGE_EXECUTIVE_2FA_CLEAR_COPY =
  'Worst-case recovery — clears TOTP and backup codes; the executive must set up 2FA on their next MD Portal login.';

export type ForgeTenantExecutiveSlot = {
  employeeId: string | null;
  email: string | null;
  twoFactorEnabled: boolean;
  fullName: string | null;
};

export type ForgeTenantExecutives = {
  md: ForgeTenantExecutiveSlot;
  od: ForgeTenantExecutiveSlot;
};

export type ForgeTenantExecutiveEmployeeRow = {
  id: string;
  company_id: string;
  rank: string | null;
  full_name: string | null;
  email: string | null;
};

export type ForgeTenantExecutiveAuthRow = {
  employee_id: string;
  work_email: string | null;
  two_factor_enabled: boolean | null;
};

export function emptyForgeTenantExecutives(): ForgeTenantExecutives {
  const emptySlot = (): ForgeTenantExecutiveSlot => ({
    employeeId: null,
    email: null,
    twoFactorEnabled: false,
    fullName: null,
  });
  return { md: emptySlot(), od: emptySlot() };
}

export function isForgeExecutive2faTarget(value: string): value is ForgeExecutive2faTarget {
  return (FORGE_EXECUTIVE_2FA_TARGETS as readonly string[]).includes(value);
}

export function resolveTenantExecutiveTarget(
  executives: ForgeTenantExecutives,
  target: ForgeExecutive2faTarget,
): ForgeTenantExecutiveSlot {
  return target === 'md' ? executives.md : executives.od;
}

export function mapCompanyExecutives(
  companyId: string,
  employees: ForgeTenantExecutiveEmployeeRow[],
  portalAuthByEmployee: Map<string, ForgeTenantExecutiveAuthRow>,
): ForgeTenantExecutives {
  const result = emptyForgeTenantExecutives();

  for (const employee of employees) {
    if (String(employee.company_id) !== companyId) continue;

    const rank = normalizePortalRole(employee.rank);
    if (rank !== 'MD' && rank !== 'OD') continue;

    const slot = rank === 'MD' ? result.md : result.od;
    const auth = portalAuthByEmployee.get(String(employee.id));

    slot.employeeId = String(employee.id);
    slot.fullName =
      typeof employee.full_name === 'string' && employee.full_name.trim()
        ? employee.full_name.trim()
        : null;
    slot.email =
      (typeof auth?.work_email === 'string' && auth.work_email.trim()
        ? auth.work_email.trim()
        : null) ??
      (typeof employee.email === 'string' && employee.email.trim()
        ? employee.email.trim()
        : null);
    slot.twoFactorEnabled = Boolean(auth?.two_factor_enabled);
  }

  return result;
}
