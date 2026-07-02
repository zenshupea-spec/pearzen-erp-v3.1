#!/usr/bin/env node
/**
 * S-22 — Wire CVS tenant portal hosts → pearzen-erp-v3-1-back-office on Vercel.
 *
 * Domains: *.pearzen.tech, cvs + CVS portal subdomains (cv, cvshq, cvsexec, cvsom, cvstm, cvssm)
 *
 * Run:
 *   npm run connect:cvs-tenant -- --dry-run
 *   npm run connect:cvs-tenant
 */

import {
  VERCEL_CNAME,
  loadEnv,
  loadVercelCliAuth,
  loadVercelRepoLink,
  parseConnectArgs,
  pearzenDomain,
  runDomainConnect,
} from './lib/pearzen-domain-connect.mjs';

const TENANT_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';

const CVS_PORTAL_DNS = ['cvshq', 'cvsexec', 'cvsom', 'cvstm', 'cvssm', 'cv'];

function tenantSubdomains() {
  return (process.env.PEARZEN_TENANT_SUBDOMAINS ?? 'cvs')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function cvsTenantConfig(dryRun) {
  const domain = pearzenDomain();
  const slugs = tenantSubdomains();
  const domains = [
    `*.${domain}`,
    ...CVS_PORTAL_DNS.map((sub) => `${sub}.${domain}`),
    ...slugs.map((sub) => `${sub}.${domain}`),
  ];

  const dnsRecords = [
    { name: '*', type: 'CNAME', content: VERCEL_CNAME },
    ...CVS_PORTAL_DNS.map((name) => ({ name, type: 'CNAME', content: VERCEL_CNAME })),
    ...slugs.map((sub) => ({ name: sub, type: 'CNAME', content: VERCEL_CNAME })),
  ];

  const vercelEnv = {
    PEARZEN_DEPLOYMENT_MODE: 'tenant-erp',
    NEXT_PUBLIC_TENANT_BASE_DOMAIN: domain,
    NEXT_PUBLIC_FORGE_HOST: `superadmin.${domain}`,
    NEXT_PUBLIC_FORGE_LEGACY_HOSTS: `forge.${domain}`,
    NEXT_PUBLIC_BACK_OFFICE_URL: `https://cvshq.${domain}`,
    NEXT_PUBLIC_TENANT_SUBDOMAINS_LIVE: 'true',
    NEXT_PUBLIC_PLATFORM_HOSTS: `${TENANT_PROJECT}.vercel.app`,
    NEXT_PUBLIC_DEV_TENANT_SLUG: slugs[0] ?? 'cvs',
    NEXT_PUBLIC_SM_PWA_URL: `https://cvssm.${domain}`,
    NEXT_PUBLIC_FIELD_PWA_URL: `https://cv.${domain}`,
    NEXT_PUBLIC_SECURITY_WEBSITE_HOST: 'classicventure.com',
  };

  return {
    label: 'CVS tenant ERP (pearzen-erp-v3-1-back-office)',
    projectName: TENANT_PROJECT,
    domains,
    dnsRecords,
    vercelEnv,
    dryRun,
  };
}

async function main() {
  const { dryRun } = parseConnectArgs();
  loadEnv();
  loadVercelCliAuth();
  loadVercelRepoLink();

  console.log(`\nconnect:cvs-tenant — ${pearzenDomain()}\n`);
  await runDomainConnect(cvsTenantConfig(dryRun));

  if (!dryRun) {
    console.log(`
Verify:
  https://cvshq.${pearzenDomain()}/login/hq
  https://cvsom.${pearzenDomain()}/login/om
  https://cv.${pearzenDomain()}  (field PWA — separate project; DNS only here)
`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
