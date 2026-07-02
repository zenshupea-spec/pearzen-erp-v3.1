/**
 * Purges verification selfies older than 60 days (rolling retention).
 * Clears photo_url on attendance_logs + sm_visit_logs and removes storage objects.
 *
 * Run daily via cron: GET /api/cron/purge-verification-photos (Vercel)
 * Or manually: npm run purge:verification-photos
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const RETENTION_DAYS = 60;
const ATTENDANCE_BUCKET = 'attendance_selfies';
const SM_VISIT_BUCKET = 'sm-visit-selfies';

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* try next */
    }
  }
}

function parseObjectPath(stored, bucket) {
  if (!stored || typeof stored !== 'string') return null;
  const value = stored.trim();
  const storageUri = value.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (storageUri) {
    if (storageUri[1] !== bucket) return null;
    return storageUri[2].split('?')[0] || null;
  }
  const markers = [
    `/object/public/${bucket}/`,
    `/object/sign/${bucket}/`,
    `/object/authenticated/${bucket}/`,
    `/${bucket}/`,
  ];
  for (const marker of markers) {
    const idx = value.indexOf(marker);
    if (idx !== -1) return value.slice(idx + marker.length).split('?')[0];
  }
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return value.replace(/^\/+/, '');
  }
  return null;
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const cutoff = new Date();
cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
const cutoffIso = cutoff.toISOString();

console.log(`Purging verification photos before ${cutoffIso} (${RETENTION_DAYS}-day retention)…`);

const attendancePaths = new Set();
const visitPaths = new Set();
let attendanceCleared = 0;
let visitCleared = 0;

async function purgeAttendanceLogs() {
  const { data: rows, error } = await supabase
    .from('attendance_logs')
    .select('id, photo_url, device_time')
    .not('photo_url', 'is', null)
    .lt('device_time', cutoffIso)
    .limit(500);

  if (error) {
    console.error('attendance_logs fetch:', error.message);
    return;
  }

  for (const row of rows ?? []) {
    const path = parseObjectPath(row.photo_url, ATTENDANCE_BUCKET);
    if (path) attendancePaths.add(path);
    const { error: updErr } = await supabase
      .from('attendance_logs')
      .update({ photo_url: null })
      .eq('id', row.id);
    if (!updErr) attendanceCleared += 1;
  }
}

async function purgeSmVisitLogs() {
  const { data: rows, error } = await supabase
    .from('sm_visit_logs')
    .select('id, photo_url, created_at')
    .not('photo_url', 'is', null)
    .lt('created_at', cutoffIso)
    .limit(500);

  if (error) {
    console.error('sm_visit_logs fetch:', error.message);
    return;
  }

  for (const row of rows ?? []) {
    const path = parseObjectPath(row.photo_url, SM_VISIT_BUCKET);
    if (path) visitPaths.add(path);
    const { error: updErr } = await supabase
      .from('sm_visit_logs')
      .update({ photo_url: null })
      .eq('id', row.id);
    if (!updErr) visitCleared += 1;
  }
}

await purgeAttendanceLogs();
await purgeSmVisitLogs();

if (attendancePaths.size > 0) {
  const { error } = await supabase.storage.from(ATTENDANCE_BUCKET).remove([...attendancePaths]);
  if (error) console.warn('attendance_selfies remove:', error.message);
  else console.log(`Removed ${attendancePaths.size} object(s) from ${ATTENDANCE_BUCKET}.`);
}

if (visitPaths.size > 0) {
  const { error } = await supabase.storage.from(SM_VISIT_BUCKET).remove([...visitPaths]);
  if (error) console.warn('sm-visit-selfies remove:', error.message);
  else console.log(`Removed ${visitPaths.size} object(s) from ${SM_VISIT_BUCKET}.`);
}

console.log(
  `Done. Cleared photo_url on ${attendanceCleared} attendance log(s) and ${visitCleared} SM visit log(s).`,
);
