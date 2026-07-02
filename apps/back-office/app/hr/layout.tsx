import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { ExecutiveBrandThemeProvider } from "../../components/executive/ExecutiveBrandTheme";
import StaffPortalChrome from "../../components/portal/StaffPortalChrome";
import { createSupabaseServerClient } from "../../../../packages/supabase/server";
import {
  canAccessHrPortal,
  fetchBackOfficeUserProfile,
} from "../../lib/hr-portal-access-server";
import { loginPathForStaffPortal } from "../../lib/portal-isolation";
import { loadExecutiveBrandTokens } from "../../lib/cvs-brand-tokens-server";
import HrCommandShellLayout from "./components/HrCommandShellLayout";

export default async function HRLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(loginPathForStaffPortal("hq"));
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canAccessHrPortal(profile.role) && !profile.rbacGated) {
    redirect(`${loginPathForStaffPortal("hq")}?error=hr_denied`);
  }

  const brandTokens = await loadExecutiveBrandTokens();

  return (
    <ExecutiveBrandThemeProvider initialTokens={brandTokens}>
      <StaffPortalChrome />
      <HrCommandShellLayout className="pb-24 font-sans selection:bg-rose-200 selection:text-slate-900">
        {children}
      </HrCommandShellLayout>
    </ExecutiveBrandThemeProvider>
  );
}
