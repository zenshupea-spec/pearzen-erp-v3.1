import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getTenantSlugFromRequest } from "./tenant-context-server";
import {
  fetchBackOfficeUserProfile as fetchBackOfficeUserProfileWithSlug,
  type BackOfficeUserProfile,
} from "./hr-portal-access";

export * from "./hr-portal-access";

export async function fetchBackOfficeUserProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<BackOfficeUserProfile> {
  return fetchBackOfficeUserProfileWithSlug(
    supabase,
    user,
    await getTenantSlugFromRequest(),
  );
}
