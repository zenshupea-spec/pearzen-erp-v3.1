#!/usr/bin/env node
/**
 * Sets Supabase Auth Site URL + redirect allow-list for Vercel production.
 * Requires SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/configure-supabase-production-auth.mjs
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/configure-supabase-production-auth.mjs --dry-run
 */

const PROJECT_REF = "ktfgvcrdfbapmefktgjc";
const TENANT_BASE_DOMAIN = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? "pearzen.tech";
const VERCEL_FALLBACK = "https://pearzen-erp-v3-1-back-office.vercel.app";
const PRODUCTION_ORIGIN =
  process.env.PRODUCTION_ORIGIN?.trim() || `https://forge.${TENANT_BASE_DOMAIN}`;

const LOCAL_ORIGINS = [
  "http://127.0.0.1:3002",
  "http://localhost:3002",
];

const TENANT_AUTH_CALLBACKS = [
  `https://*.${TENANT_BASE_DOMAIN}/auth/callback`,
  `https://*.${TENANT_BASE_DOMAIN}/auth/callback/**`,
  `https://forge.${TENANT_BASE_DOMAIN}/auth/callback`,
  `https://erp.${TENANT_BASE_DOMAIN}/auth/callback`,
  `https://${TENANT_BASE_DOMAIN}/auth/callback`,
  `https://www.${TENANT_BASE_DOMAIN}/auth/callback`,
];

const dryRun = process.argv.includes("--dry-run");
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!token) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens",
  );
  process.exit(1);
}

const redirectUrls = [
  ...LOCAL_ORIGINS.map((o) => `${o}/auth/callback`),
  `${VERCEL_FALLBACK}/auth/callback`,
  `${VERCEL_FALLBACK}/auth/callback/**`,
  `${PRODUCTION_ORIGIN}/auth/callback`,
  `${PRODUCTION_ORIGIN}/auth/callback/**`,
  ...TENANT_AUTH_CALLBACKS,
];

const payload = {
  site_url: PRODUCTION_ORIGIN,
  uri_allow_list: redirectUrls.join(","),
};

async function main() {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const getRes = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
    { headers },
  );
  if (!getRes.ok) {
    console.error("Failed to read auth config:", getRes.status, await getRes.text());
    process.exit(1);
  }

  const current = await getRes.json();
  console.log("Current site_url:", current.site_url);
  console.log("Current uri_allow_list:", current.uri_allow_list);

  console.log("\nTarget site_url:", payload.site_url);
  console.log("Target uri_allow_list:", payload.uri_allow_list);

  if (dryRun) {
    console.log("\n(dry-run — no changes applied)");
    return;
  }

  const patchRes = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
    { method: "PATCH", headers, body: JSON.stringify(payload) },
  );

  if (!patchRes.ok) {
    console.error("Failed to update auth config:", patchRes.status, await patchRes.text());
    process.exit(1);
  }

  const updated = await patchRes.json();
  console.log("\nUpdated site_url:", updated.site_url);
  console.log("Updated uri_allow_list:", updated.uri_allow_list);
  console.log("\nSupabase auth URLs configured for production.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
