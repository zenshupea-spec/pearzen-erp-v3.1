import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../../../packages/supabase/server";
import {
  canAccessHrPortal,
  fetchBackOfficeUserProfile,
} from "../../lib/hr-portal-access-server";
import { loginPathForStaffPortal } from "../../lib/portal-isolation";

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

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 pb-24 font-sans selection:bg-rose-200 selection:text-slate-900">
      {children}
    </main>
  );
}
