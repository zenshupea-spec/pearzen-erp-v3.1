/**
 * Purges verification selfies older than 60 days (rolling retention).
 * Clears photo_url on attendance_logs + sm_visit_logs and removes storage objects.
 *
 * Run daily via cron: node scripts/purge-verification-photos.mjs
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const RETENTION_DAYS = 60;

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

function storagePathFromPublicUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const marker = '/attendance_selfies/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split('?')[0];
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

const pathsToRemove = new Set();

async function purgeAttendanceLogs() {
  const { data: rows, error } = await supabase
    .from('attendance_logs')
    .select('id, photo_url, device_time')
    .not('photo_url', 'is', null)
    .lt('device_time', cutoffIso)
    .limit(500);

  if (error) {
    console.error('attendance_logs fetch:', error.message);
    return 0;
  }

  let count = 0;
  for (const row of rows ?? []) {
    const path = storagePathFromPublicUrl(row.photo_url);
    if (path) pathsToRemove.add(path);

    const { error: updErr } = await supabase
      .from('attendance_logs')
      .update({ photo_url: null })
      .eq('id', row.id);

    if (!updErr) count += 1;
  }
  return count;
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
    return 0;
  }

  let count = 0;
  for (const row of rows ?? []) {
    const path = storagePathFromPublicUrl(row.photo_url);
    if (path) pathsToRemove.add(path);

    const { error: updErr } = await supabase
      .from('sm_visit_logs')
      .update({ photo_url: null })
      .eq('id', row.id);

    if (!updErr) count += 1;
  }
  return count;
}

const attendanceCleared = await purgeAttendanceLogs();
const visitCleared = await purgeSmVisitLogs();

if (pathsToRemove.size > 0) {
  const paths = [...pathsToRemove];
  const { error: storageErr } = await supabase.storage
    .from('attendance_selfies')
    .remove(paths);

  if (storageErr) {
    console.warn('Storage remove warning:', storageErr.message);
  } else {
    console.log(`Removed ${paths.length} object(s) from attendance_selfies bucket.`);
  }
}

console.log(
  `Done. Cleared photo_url on ${attendanceCleared} attendance log(s) and ${visitCleared} SM visit log(s).`,
);
