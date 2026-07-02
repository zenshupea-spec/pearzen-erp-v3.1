/**
 * F-5 — Verify V.O. sector managers + update contact phones + provision SM auth.
 *
 * Usage: node scripts/apply-cvs-mnr-remediation-f5.mjs
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from '../apps/back-office/lib/encryption.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const VO_REF = [
  { loc: 'A', epf: '13650', contact: '0753632020' },
  { loc: 'B', epf: '13496', contact: '0753632021' },
  { loc: 'C', epf: '13033', contact: '0753632022' },
  { loc: 'D', epf: '12410', contact: '0753632023' },
  { loc: 'E', epf: '12222', contact: '0753632024' },
  { loc: 'F', epf: '13069', contact: '0753632025' },
  { loc: 'G', epf: '13085', contact: '0753632013' },
  { loc: 'H', epf: '12208', contact: '0753632027' },
  { loc: 'I', epf: '13875', contact: '0753632028' },
  { loc: 'J', epf: '13470', contact: '0753632026' },
];

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* next */
    }
  }
}

function log(line) {
  const msg = `[F-5 APPLY] ${line}`;
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-apply-log.txt'), `${new Date().toISOString()} ${msg}\n`);
}

function normPhoneDigits(s) {
  return String(s ?? '').replace(/\D/g, '');
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

async function provisionSmAuth(admin, epf, usersByEmail) {
  const email = smAuthEmail(epf);
  const otp = generateOtp();
  const existingId = usersByEmail.get(email);

  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password: otp,
      email_confirm: true,
    });
    if (error) throw error;
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password: otp,
      email_confirm: true,
    });
    if (error) throw error;
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
  if (dbErr) throw dbErr;
  return true;
}

async function main() {
  loadEnv();
  process.env.NODE_ENV ??= 'development';
  mkdirSync(outDir, { recursive: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const usersByEmail = new Map(
    (await listAllAuthUsers(supabase)).map((u) => [String(u.email ?? '').toLowerCase(), u.id]),
  );

  let rankGroupFixed = 0;
  let phonesUpdated = 0;
  let authProvisioned = 0;
  let authExisting = 0;
  const phoneChecks = [];

  for (const ref of VO_REF) {
    const { data: emp, error } = await supabase
      .from('employees')
      .select('id, emp_number, full_name, group, rank, status, phone')
      .eq('company_id', CVS_COMPANY_ID)
      .eq('emp_number', ref.epf)
      .maybeSingle();

    if (error) throw error;
    if (!emp) {
      log(`MISSING EPF ${ref.epf} (${ref.loc})`);
      continue;
    }

    const needsRankGroup =
      (emp.group ?? '').toUpperCase() !== 'SECTOR_MANAGER' ||
      !['VO', 'OIC'].includes((emp.rank ?? '').toUpperCase()) ||
      (emp.status ?? '').toUpperCase() !== 'ACTIVE';

    const encryptedPhone = encrypt(ref.contact);
    const currentDigits = normPhoneDigits(decrypt(emp.phone) ?? '');
    const needsPhone = currentDigits !== normPhoneDigits(ref.contact);

    const payload = {};
    if (needsRankGroup) {
      payload.group = 'SECTOR_MANAGER';
      payload.rank = 'VO';
      payload.status = 'ACTIVE';
      rankGroupFixed += 1;
    }
    if (needsPhone) {
      payload.phone = encryptedPhone;
      phonesUpdated += 1;
    }

    if (Object.keys(payload).length) {
      const { error: updErr } = await supabase
        .from('employees')
        .update(payload)
        .eq('id', emp.id);
      if (updErr) throw updErr;
      log(
        `EPF ${ref.epf} (${ref.loc}) ${emp.full_name}: ` +
          `${needsRankGroup ? 'rank/group ' : ''}${needsPhone ? 'phone ' : ''}updated`,
      );
    } else {
      log(`EPF ${ref.epf} (${ref.loc}) already correct rank/group/phone`);
    }

    const { data: authRow } = await supabase
      .from('sm_portal_auth')
      .select('epf_number, is_active')
      .eq('epf_number', ref.epf)
      .maybeSingle();

    if (!authRow?.is_active) {
      await provisionSmAuth(supabase, ref.epf, usersByEmail);
      authProvisioned += 1;
      log(`EPF ${ref.epf}: sm_portal_auth provisioned`);
    } else {
      authExisting += 1;
    }

    const { data: after } = await supabase
      .from('employees')
      .select('phone')
      .eq('id', emp.id)
      .single();
    phoneChecks.push({
      epf: ref.epf,
      expected: ref.contact,
      decrypted: decrypt(after?.phone) ?? '',
      ok: normPhoneDigits(decrypt(after?.phone)) === normPhoneDigits(ref.contact),
    });
  }

  const report = [
    '',
    '=== F-5 APPLY LOG ===',
    `Run at: ${new Date().toISOString()}`,
    `V.O. rows: ${VO_REF.length}`,
    `Rank/group fixes: ${rankGroupFixed}`,
    `Phones updated: ${phonesUpdated}`,
    `sm_portal_auth existing: ${authExisting}`,
    `sm_portal_auth provisioned: ${authProvisioned}`,
    'Phone verify:',
    ...phoneChecks.map((p) => `  ${p.ok ? '✓' : '✗'} EPF ${p.epf} → ${p.decrypted}`),
    phoneChecks.every((p) => p.ok) ? 'F-5 PASS' : 'F-5 PHONE MISMATCH',
    '',
    'F-5 COMPLETE — proceed to F-6',
  ];

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));

  if (!phoneChecks.every((p) => p.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [F-5 FATAL] ${err.message}\n`,
  );
  process.exit(1);
});
