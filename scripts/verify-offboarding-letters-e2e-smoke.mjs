/**
 * E2E smoke: offboarding letter track (live Supabase + schedule logic).
 * Run: node scripts/verify-offboarding-letters-e2e-smoke.mjs
 *
 * Covers:
 *  1. Start track → letter 1 due today
 *  2. Mark L1 sent + PDF upload → L1 tick state sent
 *  3. Start+3 mock → letter 2 due
 *  4. Complete track → no pending reminders / ACTIVE hidden
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SMOKE_TAG = 'OFFBOARDING_LETTERS_E2E_SMOKE';
const BUCKET = 'employee-hr-documents';
const SELECT =
  'id, company_id, employee_id, guard_epf, status, sequence_started_at, letter_1_sent_at, letter_1_doc_url, letter_2_sent_at, letter_2_doc_url, letter_3_sent_at, letter_3_doc_url, completed_at, completion_notes, created_at, updated_at';

const LETTER_OFFSET_DAYS = { 1: 0, 2: 3, 3: 7 };

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

function formatDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayDateOnly() {
  return formatDateOnly(new Date());
}

function addCalendarDays(isoDate, days) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateOnly(d);
}

function letterDueDate(startIso, index) {
  return addCalendarDays(startIso.slice(0, 10), LETTER_OFFSET_DAYS[index]);
}

function mapTrackRow(row) {
  return {
    status: row.status,
    sequenceStartedAt: String(row.sequence_started_at).slice(0, 10),
    letters: {
      1: { sentAt: row.letter_1_sent_at, docUrl: row.letter_1_doc_url },
      2: { sentAt: row.letter_2_sent_at, docUrl: row.letter_2_doc_url },
      3: { sentAt: row.letter_3_sent_at, docUrl: row.letter_3_doc_url },
    },
    completedAt: row.completed_at,
  };
}

function buildLetterReminderStates(track, today) {
  const start = track.sequenceStartedAt.slice(0, 10);
  return [1, 2, 3].map((index) => {
    const dueDate = letterDueDate(start, index);
    const line = track.letters[index];
    const isSent = Boolean(line.sentAt);
    const cmp = today.localeCompare(dueDate);
    return {
      index,
      dueDate,
      isDue: !isSent && cmp >= 0,
      isOverdue: !isSent && cmp > 0,
      isSent,
      sentAt: line.sentAt,
      docUrl: line.docUrl,
    };
  });
}

function pendingReminderIndexes(states) {
  return states.filter((s) => s.isDue && !s.isSent).map((s) => s.index);
}

function hasActivePendingReminders(track, today) {
  if (track.status !== 'ACTIVE') return false;
  return pendingReminderIndexes(buildLetterReminderStates(track, today)).length > 0;
}

function buildStoragePath(companyId, employeeId, letterIndex, ext) {
  return `${companyId}/offboarding-letters/${employeeId}/letter-${letterIndex}.${ext}`;
}

async function cleanupSmoke(db, employeeId) {
  const { data: rows } = await db
    .from('guard_offboarding_letter_tracks')
    .select('id, letter_1_doc_url, letter_2_doc_url, letter_3_doc_url')
    .eq('employee_id', employeeId)
    .like('completion_notes', `${SMOKE_TAG}%`);

  const paths = [];
  for (const row of rows ?? []) {
    for (const url of [row.letter_1_doc_url, row.letter_2_doc_url, row.letter_3_doc_url]) {
      if (url?.includes('/employee-hr-documents/')) {
        paths.push(url.split('/employee-hr-documents/')[1]);
      }
    }
  }
  if (paths.length) await db.storage.from(BUCKET).remove(paths);

  await db
    .from('guard_offboarding_letter_tracks')
    .delete()
    .eq('employee_id', employeeId)
    .like('completion_notes', `${SMOKE_TAG}%`);
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
  const today = todayDateOnly();

  const { data: guard, error: guardErr } = await db
    .from('employees')
    .select('id, company_id, full_name, emp_number, section_edits')
    .eq('status', 'ACTIVE')
    .not('emp_number', 'is', null)
    .limit(1)
    .maybeSingle();

  if (guardErr || !guard) {
    console.error('No active employee with EPF for E2E smoke');
    process.exit(1);
  }

  await cleanupSmoke(db, guard.id);

  const guardEpf = String(guard.emp_number).trim().toUpperCase();

  // --- 1. Start track today → L1 due ---
  const { data: created, error: createErr } = await db
    .from('guard_offboarding_letter_tracks')
    .insert({
      company_id: guard.company_id,
      employee_id: guard.id,
      guard_epf: guardEpf,
      status: 'ACTIVE',
      sequence_started_at: today,
      completion_notes: `${SMOKE_TAG} step1`,
    })
    .select(SELECT)
    .single();

  assert('Start ACTIVE track (day 0 = today)', !createErr, createErr?.message);

  let track = mapTrackRow(created);
  let states = buildLetterReminderStates(track, today);
  assert('Letter 1 due on start day', states[0].isDue && !states[0].isSent);
  assert('Letter 2 not due on start day', !states[1].isDue);
  assert('Letter 3 not due on start day', !states[2].isDue);
  assert('Meta ticks would show (ACTIVE + pending)', hasActivePendingReminders(track, today));

  // --- 2. Mark L1 sent + PDF upload ---
  const pdfPath = buildStoragePath(guard.company_id, guard.id, 1, 'pdf');
  const pdfBytes = Buffer.from(
    `%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%${SMOKE_TAG}-L1\n`,
    'utf8',
  );
  const { error: uploadErr } = await db.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  assert('Upload letter 1 PDF', !uploadErr, uploadErr?.message);

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(pdfPath);
  const docUrl = urlData.publicUrl;

  const sentAt = new Date().toISOString();
  const sectionEdits = {
    ...(guard.section_edits && typeof guard.section_edits === 'object' ? guard.section_edits : {}),
    offboarding: { at: sentAt, by: `${SMOKE_TAG} HR` },
  };

  const { data: afterL1, error: markErr } = await db
    .from('guard_offboarding_letter_tracks')
    .update({
      letter_1_sent_at: sentAt,
      letter_1_doc_url: docUrl,
      updated_at: sentAt,
    })
    .eq('id', created.id)
    .select(SELECT)
    .single();

  await db.from('employees').update({ section_edits: sectionEdits }).eq('id', guard.id);

  assert('Mark letter 1 sent with doc URL', !markErr && Boolean(afterL1?.letter_1_doc_url));

  track = mapTrackRow(afterL1);
  states = buildLetterReminderStates(track, today);
  assert('Letter 1 tick = sent (green)', states[0].isSent);
  assert('Letter 1 no longer in pending due list', !pendingReminderIndexes(states).includes(1));

  // --- 3. Start+3 mock → L2 due ---
  await db.from('guard_offboarding_letter_tracks').delete().eq('id', created.id);
  await db.storage.from(BUCKET).remove([pdfPath]);

  const startMinus3 = addCalendarDays(today, -3);
  const l2Due = letterDueDate(startMinus3, 2);

  const { data: agedTrack, error: agedErr } = await db
    .from('guard_offboarding_letter_tracks')
    .insert({
      company_id: guard.company_id,
      employee_id: guard.id,
      guard_epf: guardEpf,
      status: 'ACTIVE',
      sequence_started_at: startMinus3,
      letter_1_sent_at: sentAt,
      letter_1_doc_url: docUrl,
      completion_notes: `${SMOKE_TAG} step3`,
    })
    .select(SELECT)
    .single();

  assert('Seed track started 3 days ago', !agedErr, agedErr?.message);

  track = mapTrackRow(agedTrack);
  states = buildLetterReminderStates(track, today);
  assert(
    `Letter 2 due at start+3 (${l2Due})`,
    states[1].isDue && !states[1].isSent && states[1].dueDate === l2Due,
  );
  assert('Letter 2 in pending reminder indexes', pendingReminderIndexes(states).includes(2));

  const { data: companyActive } = await db
    .from('guard_offboarding_letter_tracks')
    .select(SELECT)
    .eq('company_id', guard.company_id)
    .eq('status', 'ACTIVE');

  const dashboardCount = (companyActive ?? []).filter((row) => {
    const snap = mapTrackRow(row);
    return hasActivePendingReminders(snap, today);
  }).length;
  assert('Dashboard reminder count ≥ 1', dashboardCount >= 1, `count=${dashboardCount}`);

  // --- 4. Complete track → ticks hidden ---
  const completedAt = new Date().toISOString();
  const { data: completed, error: completeErr } = await db
    .from('guard_offboarding_letter_tracks')
    .update({
      status: 'COMPLETED',
      completed_at: completedAt,
      completion_notes: `${SMOKE_TAG} completed`,
      updated_at: completedAt,
    })
    .eq('id', agedTrack.id)
    .eq('status', 'ACTIVE')
    .select(SELECT)
    .single();

  assert('Complete letter track', !completeErr && completed?.status === 'COMPLETED', completeErr?.message);

  track = mapTrackRow(completed);
  assert('No pending reminders after COMPLETED', !hasActivePendingReminders(track, today));
  assert('Meta ticks hidden (not ACTIVE)', track.status !== 'ACTIVE');

  await cleanupSmoke(db, guard.id);

  console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll E2E checks passed.');
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
