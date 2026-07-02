/**
 * C-4 — Provision CVS SM + field portal auth after legacy MNR import.
 *
 * Usage:
 *   node scripts/provision-cvs-legacy-portal-auth.mjs --sm
 *   node scripts/provision-cvs-legacy-portal-auth.mjs --guards sample
 *   node scripts/provision-cvs-legacy-portal-auth.mjs --guards all
 *   node scripts/provision-cvs-legacy-portal-auth.mjs --sm --guards sample
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const SAMPLE_GUARD_EPFS = ['12', '17', '4861', '10038', '10168'];

const args = process.argv.slice(2);
const doSm = args.includes('--sm');
const guardsMode = args.includes('--guards')
  ? args[args.indexOf('--guards') + 1] ?? 'sample'
  : null;

if (!doSm && !guardsMode) {
  console.error('Usage: --sm [--guards sample|all]');
  process.exit(1);
}

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', 'apps/field-pwa/.env.local']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      /* skip */
    }
  }
}

function smAuthEmail(epf) {
  return `${String(epf).trim().toLowerCase()}@pearzen.sm`;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function listAllAuthUsers(admin) {
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    users.push(...(data?.users ?? []));
    if ((data?.users?.length ?? 0) < 1000) break;
  }
  return users;
}

async function provisionSmPortalAuth(admin) {
  const { data: managers, error } = await admin
    .from('employees')
    .select('emp_number, epf_no, full_name')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE');

  if (error) throw new Error(`SM employees: ${error.message}`);

  const usersByEmail = new Map(
    (await listAllAuthUsers(admin)).map((u) => [String(u.email ?? '').toLowerCase(), u.id]),
  );

  let provisioned = 0;
  const lines = [];
  for (const mgr of managers ?? []) {
    const epf = String(mgr.emp_number ?? mgr.epf_no ?? '').trim().toUpperCase();
    if (!epf) continue;

    const email = smAuthEmail(epf);
    const otp = generateOtp();
    const existingId = usersByEmail.get(email);

    if (existingId) {
      const { error: updErr } = await admin.auth.admin.updateUserById(existingId, {
        password: otp,
        email_confirm: true,
      });
      if (updErr) {
        lines.push(`  ⚠ SM ${epf}: ${updErr.message}`);
        continue;
      }
    } else {
      const { error: createErr } = await admin.auth.admin.createUser({
        email,
        password: otp,
        email_confirm: true,
      });
      if (createErr) {
        lines.push(`  ⚠ SM ${epf}: ${createErr.message}`);
        continue;
      }
    }

    const { error: dbErr } = await admin.from('sm_portal_auth').upsert(
      {
        epf_number: epf,
        current_otp: otp,
        needs_pin_setup: true,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'epf_number' },
    );

    if (dbErr) {
      lines.push(`  ⚠ sm_portal_auth ${epf}: ${dbErr.message}`);
      continue;
    }

    provisioned += 1;
    lines.push(`  ✓ SM ${epf} (${mgr.full_name})`);
  }

  return { provisioned, total: managers?.length ?? 0, lines };
}

function fieldPwaAuthEmail(epf) {
  return `${String(epf).trim().toLowerCase()}@pearzen.local`;
}

function fieldPwaAuthPassword(epfOrKey) {
  const fixed = process.env.FIELD_PWA_AUTH_PASSWORD?.trim();
  if (fixed) return fixed;
  const template = process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE || '{{epfNo}}';
  const password = template
    .replaceAll('{{epfNo}}', epfOrKey)
    .replaceAll('{{empNumber}}', epfOrKey);
  return password.length >= 6 ? password : `guard-${password}`;
}

function canonicalEpfFromEmployee(row) {
  const epf = row.epf_no ?? row.epf_num;
  return epf != null ? String(epf).trim() : '';
}

async function provisionGuardPortalAuth(admin, employee) {
  const canonicalEpf = canonicalEpfFromEmployee(employee);
  if (!canonicalEpf) return { ok: false, error: 'No EPF on file.' };

  const email = fieldPwaAuthEmail(canonicalEpf);
  const password = fieldPwaAuthPassword(canonicalEpf);
  if (!employee.company_id) return { ok: false, error: 'Missing company_id.' };

  const authTenantMeta = {
    app_metadata: { company_id: employee.company_id },
    user_metadata: { employee_id: employee.id },
  };

  const users = await listAllAuthUsers(admin);
  const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (found) {
    const { error } = await admin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      ...authTenantMeta,
    });
    if (error) return { ok: false, error: `Auth update: ${error.message}` };
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      ...authTenantMeta,
    });
    if (error) return { ok: false, error: `Auth create: ${error.message}` };
  }

  return { ok: true, email };
}

async function provisionGuardAuth(admin, mode) {
  process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE =
    process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE || '{{epfNo}}';

  let query = admin
    .from('employees')
    .select('id, full_name, emp_number, epf_no, epf_num, status, company_id')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('group', 'GUARD')
    .eq('status', 'ACTIVE');

  if (mode === 'sample') {
    query = query.in('emp_number', SAMPLE_GUARD_EPFS);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`guard employees: ${error.message}`);

  let ok = 0;
  let failed = 0;
  const lines = [];
  for (const row of rows ?? []) {
    const epf = canonicalEpfFromEmployee(row);
    if (!epf) continue;
    const result = await provisionGuardPortalAuth(admin, row);
    if (!result.ok) {
      failed += 1;
      lines.push(`  ✗ ${epf}: ${result.error}`);
      continue;
    }
    ok += 1;
    lines.push(`  ✓ guard ${epf} → ${result.email}`);
  }

  return { ok, failed, total: rows?.length ?? 0, lines };
}

async function main() {
  loadEnv();
  process.env.NODE_ENV ??= 'development';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing Supabase env');
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('CVS legacy portal auth (C-4)\n');
  console.log(`  Supabase: ${url}`);
  console.log(`  company_id: ${CVS_COMPANY_ID}\n`);

  if (doSm) {
    console.log('SM portal auth…');
    const sm = await provisionSmPortalAuth(admin);
    for (const line of sm.lines) console.log(line);
    console.log(`  → ${sm.provisioned}/${sm.total} sector managers provisioned\n`);
  }

  if (guardsMode) {
    if (guardsMode !== 'sample' && guardsMode !== 'all') {
      console.error('--guards must be "sample" or "all"');
      process.exit(1);
    }
    console.log(`Field PWA guard auth (${guardsMode})…`);
    const g = await provisionGuardAuth(admin, guardsMode);
    for (const line of g.lines.slice(0, 20)) console.log(line);
    if (g.lines.length > 20) console.log(`  … ${g.lines.length - 20} more`);
    console.log(`  → ${g.ok} provisioned, ${g.failed} failed (${g.total} targeted)\n`);
    if (guardsMode === 'all') {
      console.log('  Full guard roster auth complete. Remaining guards auto-provision on first login.');
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
