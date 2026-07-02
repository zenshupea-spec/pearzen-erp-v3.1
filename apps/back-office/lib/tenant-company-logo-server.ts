import "server-only";

import type { Metadata } from "next";

import { getCompanyLogoUrl } from "../../../packages/supabase/company-branding";
import { createSupabaseServerClient } from "../../../packages/supabase/server";

import { resolveCompanyIdForSession } from "./company-context-server";
import { resolveTenantCompanyFromRequest } from "./tenant-context-server";

const DEFAULT_FAVICON = "/pearzen-website/pearzen-technologies-logo.png";

function logoMimeType(url: string): string | undefined {
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return undefined;
}

/** Tenant company logo for chrome (sidebar, favicon) — session first, then hostname slug. */
export async function resolveTenantCompanyLogoUrl(): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient();
    const companyId = await resolveCompanyIdForSession(supabase);
    if (companyId) {
      const url = await getCompanyLogoUrl(companyId);
      if (url) return url;
    }
  } catch {
    // Unauthenticated or unresolved session — fall through to slug lookup.
  }

  const tenant = await resolveTenantCompanyFromRequest();
  if (tenant?.id) {
    const url = await getCompanyLogoUrl(tenant.id);
    if (url) return url;
  }

  return DEFAULT_FAVICON;
}

export function buildFaviconMetadata(logoUrl: string): NonNullable<Metadata["icons"]> {
  const type = logoMimeType(logoUrl);
  const icon = type ? { url: logoUrl, type } : { url: logoUrl };
  return {
    icon: [icon],
    apple: [icon],
    shortcut: [icon],
  };
}
