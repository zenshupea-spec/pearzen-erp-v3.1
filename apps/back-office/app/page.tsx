import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../../packages/supabase/server";
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from "../lib/hr-portal-access-server";
import { loginPathForRole } from "../lib/portal-isolation";

/** Root is not a public hub — unauthenticated users pick a portal; signed-in users go to theirs. */
export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const landing = authenticatedLandingPath(profile.role, profile);
  const loginPath = loginPathForRole(profile.role, profile);

  if (landing.startsWith("/login")) {
    redirect(`${loginPath}?error=no_portal_rank`);
  }

  redirect(landing);
}
