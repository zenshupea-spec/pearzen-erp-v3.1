/**
 * Smoke test: offboarding letter PDF upload to employee-hr-documents bucket.
 * Run: node scripts/verify-offboarding-letter-upload-smoke.mjs
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SMOKE_TAG = 'OFFBOARDING_LETTER_UPLOAD_SMOKE';
const BUCKET = 'employee-hr-documents';

function loadEnv() {
  const path = join(root, 'apps/back-office/.env.local');
  if (!existsSync(path)) {
    console.error('Missing apps/back-office/.env.local');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function assert(label, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`${status}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

const failures = [];

function buildPath(companyId, employeeId, letterIndex, ext) {
  return `${companyId}/offboarding-letters/${employeeId}/letter-${letterIndex}.${ext}`;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing Supabase URL or service role key');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: guard, error: guardErr } = await db
    .from('employees')
    .select('id, company_id')
    .eq('status', 'ACTIVE')
    .not('company_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (guardErr || !guard?.company_id) {
    console.error('No active employee with company_id for smoke test');
    process.exit(1);
  }

  const path = buildPath(guard.company_id, guard.id, 1, 'pdf');
  const pdfBytes = Buffer.from(
    `%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%${SMOKE_TAG}\n`,
    'utf8',
  );

  const { error: uploadErr } = await db.storage.from(BUCKET).upload(path, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  assert('Upload offboarding letter PDF', !uploadErr, uploadErr?.message);

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);
  assert('Public URL returned', Boolean(urlData?.publicUrl), urlData?.publicUrl ?? '');

  const { data: listed } = await db.storage.from(BUCKET).list(
    `${guard.company_id}/offboarding-letters/${guard.id}`,
    { limit: 10 },
  );
  const found = (listed ?? []).some((entry) => entry.name === 'letter-1.pdf');
  assert('Object listed under offboarding-letters prefix', found);

  await db.storage.from(BUCKET).remove([path]);

  console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll checks passed.');
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
