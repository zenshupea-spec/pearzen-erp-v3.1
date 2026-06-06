import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../../packages/supabase/server";
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from "../lib/hr-portal-access";

/** Root is not a public hub — unauthenticated users go to login; signed-in users go to their portal. */
export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login/head-office");
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const landing = authenticatedLandingPath(profile.role);

  if (landing === "/login/head-office") {
    redirect("/login/head-office?error=no_portal_rank");
  }

  redirect(landing);
}
