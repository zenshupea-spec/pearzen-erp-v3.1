import "server-only";

import { cookies } from "next/headers";

import { createSupabaseServiceClient } from "../../../packages/supabase/service";
import { supabaseAuthCookieSecure } from "../../../packages/supabase/cookie-options";
import { TENANT_SLUG_COOKIE, normalizeTenantSlug } from "./tenant-host";

const TENANT_SLUG_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export async function lookupCompanyTenantSlug(
  companyId: string | null | undefined,
): Promise<string | null> {
  const trimmed = companyId?.trim();
  if (!trimmed) return null;

  const db = createSupabaseServiceClient();
  const { data } = await db
    .from("companies")
    .select("slug")
    .eq("id", trimmed)
    .maybeSingle();

  return normalizeTenantSlug(String(data?.slug ?? ""));
}

/** httpOnly tenant slug cookie — set only after login membership is verified. */
export async function setVerifiedTenantSlugCookieForCompany(
  companyId: string | null | undefined,
): Promise<void> {
  const slug = await lookupCompanyTenantSlug(companyId);
  if (!slug) return;

  const store = await cookies();
  store.set(TENANT_SLUG_COOKIE, slug, {
    path: "/",
    sameSite: "lax",
    maxAge: TENANT_SLUG_COOKIE_MAX_AGE_SEC,
    httpOnly: true,
    secure: supabaseAuthCookieSecure(),
  });
}

export async function resolveEmployeeCompanyId(
  employeeId: string | null | undefined,
): Promise<string | null> {
  const trimmed = employeeId?.trim();
  if (!trimmed) return null;

  const db = createSupabaseServiceClient();
  const { data } = await db
    .from("employees")
    .select("company_id")
    .eq("id", trimmed)
    .maybeSingle();

  const companyId = data?.company_id;
  return typeof companyId === "string" && companyId.length > 0 ? companyId : null;
}
