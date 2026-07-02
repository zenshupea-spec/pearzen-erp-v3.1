export type ForgeBillingCompany = {
  id: string;
  name: string;
  slug: string | null;
};

/** Forge billing never auto-selects CVS; operators must pick a tenant (or use ?company=). */
export function forgeBillingDefaultCompanyId(
  _companies: ForgeBillingCompany[],
): string | null {
  return null;
}
