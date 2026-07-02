/**
 * Backfill sm_portal_auth for active SECTOR_MANAGER rows missing OTP hash.
 * Run: node scripts/backfill-sm-portal-auth.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      /* next */
    }
  }
}

function hashOtp(otp, epf) {
  const pepper =
    process.env.SM_PORTAL_OTP_PEPPER?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'dev-sm-otp-pepper';
  return createHash('sha256')
    .update(`${epf.toUpperCase()}:${otp}:${pepper}`)
    .digest('hex');
}

loadEnv();

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: emps, error } = await admin
  .from('employees')
  .select('id, full_name, emp_number, epf_no, company_id')
  .eq('group', 'SECTOR_MANAGER')
  .eq('status', 'ACTIVE')
  .order('created_at', { ascending: false });

if (error) {
  console.error(error.message);
  process.exit(1);
}

let provisioned = 0;
for (const emp of emps ?? []) {
  const epf = String(emp.emp_number ?? emp.epf_no ?? '')
    .trim()
    .toUpperCase();
  if (!epf) {
    console.log(`skip (no EPF): ${emp.full_name}`);
    continue;
  }

  const { data: existing } = await admin
    .from('sm_portal_auth')
    .select('epf_number, current_otp_hash')
    .eq('epf_number', epf)
    .maybeSingle();

  if (existing?.current_otp_hash) {
    console.log(`ok: ${epf} ${emp.full_name}`);
    continue;
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const email = `${epf.toLowerCase()}@pearzen.sm`;
  const meta = {
    app_metadata: { company_id: emp.company_id },
    user_metadata: { employee_id: emp.id },
  };

  const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = userList?.users?.find((u) => u.email === email);

  if (found) {
    const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
      password: otp,
      email_confirm: true,
      ...meta,
    });
    if (updErr) {
      console.error(`auth update ${epf}: ${updErr.message}`);
      continue;
    }
  } else {
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password: otp,
      email_confirm: true,
      ...meta,
    });
    if (createErr) {
      console.error(`auth create ${epf}: ${createErr.message}`);
      continue;
    }
  }

  const { error: dbErr } = await admin.from('sm_portal_auth').upsert(
    {
      epf_number: epf,
      current_otp: null,
      current_otp_hash: hashOtp(otp, epf),
      otp_expires_at: new Date(Date.now() + 60_000).toISOString(),
      needs_pin_setup: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'epf_number' },
  );

  if (dbErr) {
    console.error(`db ${epf}: ${dbErr.message}`);
    continue;
  }

  provisioned += 1;
  console.log(`PROVISIONED ${epf} (${emp.full_name}) — OTP ${otp} (60s window, share via HR desk)`);
}

console.log(`\nDone. ${provisioned} SM(s) provisioned.`);
