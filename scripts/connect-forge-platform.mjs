#!/usr/bin/env node
/**
 * S-22 — Wire Forge platform hosts → pearzen-forge-back-office on Vercel.
 *
 * Domains: pearzen.tech, www, forge, superadmin, erp, partners
 *
 * Run:
 *   npm run connect:forge-platform -- --dry-run
 *   npm run connect:forge-platform
 */

import {
  VERCEL_APEX_A,
  VERCEL_CNAME,
  loadEnv,
  loadVercelCliAuth,
  loadVercelRepoLink,
  parseConnectArgs,
  pearzenDomain,
  runDomainConnect,
} from './lib/pearzen-domain-connect.mjs';

const FORGE_PROJECT =
  process.env.VERCEL_FORGE_BACK_OFFICE_PROJECT?.trim() || 'pearzen-forge-back-office';

function forgeConfig(dryRun) {
  const domain = pearzenDomain();
  const domains = [
    domain,
    `www.${domain}`,
    `forge.${domain}`,
    `superadmin.${domain}`,
    `erp.${domain}`,
    `partners.${domain}`,
  ];

  const dnsRecords = [
    { name: '', type: 'A', content: VERCEL_APEX_A },
    { name: 'www', type: 'CNAME', content: VERCEL_CNAME },
    { name: 'forge', type: 'CNAME', content: VERCEL_CNAME },
    { name: 'superadmin', type: 'CNAME', content: VERCEL_CNAME },
    { name: 'erp', type: 'CNAME', content: VERCEL_CNAME },
    { name: 'partners', type: 'CNAME', content: VERCEL_CNAME },
  ];

  const vercelEnv = {
    PEARZEN_DEPLOYMENT_MODE: 'forge',
    NEXT_PUBLIC_TENANT_BASE_DOMAIN: domain,
    NEXT_PUBLIC_FORGE_HOST: `superadmin.${domain}`,
    NEXT_PUBLIC_FORGE_LEGACY_HOSTS: `forge.${domain}`,
    NEXT_PUBLIC_PEARZEN_WEBSITE_HOST: domain,
  };

  return {
    label: 'Forge platform (pearzen-forge-back-office)',
    projectName: FORGE_PROJECT,
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

  console.log(`\nconnect:forge-platform — ${pearzenDomain()}\n`);
  await runDomainConnect(forgeConfig(dryRun));

  if (!dryRun) {
    console.log(`
Verify:
  https://superadmin.${pearzenDomain()}/forge
  https://forge.${pearzenDomain()}/forge
  https://erp.${pearzenDomain()}/select-tenant
`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
