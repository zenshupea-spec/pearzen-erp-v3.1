/**
 * Purges café task proof photos after the 14-day retention window.
 * Clears proof_url on cafe_task_completions (keeps status + proof_uploaded_at + purge_after)
 * and removes storage objects from cafe_task_proofs / legacy attendance_selfies paths.
 *
 * Run daily via cron: GET /api/cron/purge-cafe-task-proofs (Vercel)
 * Or manually: npm run purge:cafe-task-proofs
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const CAFE_TASK_PROOFS_BUCKET = 'cafe_task_proofs';
const ATTENDANCE_BUCKET = 'attendance_selfies';
const BATCH = 500;

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

function parseStorageRef(stored) {
  if (!stored || typeof stored !== 'string') return null;
  const value = stored.trim();
  const storageUri = value.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (storageUri) {
    const bucket = storageUri[1];
    const objectPath = storageUri[2].split('?')[0] || null;
    if (!objectPath) return null;
    if (bucket !== CAFE_TASK_PROOFS_BUCKET && bucket !== ATTENDANCE_BUCKET) return null;
    return { bucket, objectPath };
  }

  for (const bucket of [CAFE_TASK_PROOFS_BUCKET, ATTENDANCE_BUCKET]) {
    const markers = [
      `/object/public/${bucket}/`,
      `/object/sign/${bucket}/`,
      `/object/authenticated/${bucket}/`,
      `/${bucket}/`,
    ];
    for (const marker of markers) {
      const idx = value.indexOf(marker);
      if (idx !== -1) {
        return { bucket, objectPath: value.slice(idx + marker.length).split('?')[0] };
      }
    }
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      return { bucket, objectPath: value.replace(/^\/+/, '') };
    }
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
const referenceDate = new Date().toISOString().slice(0, 10);

console.log(`Purging café task proofs with purge_after before ${referenceDate}…`);

const pathsByBucket = new Map();
let rowsCleared = 0;

const { data: rows, error } = await supabase
  .from('cafe_task_completions')
  .select('id, proof_url, purge_after')
  .not('proof_url', 'is', null)
  .lt('purge_after', referenceDate)
  .limit(BATCH);

if (error) {
  console.error('cafe_task_completions fetch:', error.message);
  process.exit(1);
}

for (const row of rows ?? []) {
  const ref = parseStorageRef(row.proof_url);
  if (ref) {
    const bucketPaths = pathsByBucket.get(ref.bucket) ?? new Set();
    bucketPaths.add(ref.objectPath);
    pathsByBucket.set(ref.bucket, bucketPaths);
  }

  const { error: updErr } = await supabase
    .from('cafe_task_completions')
    .update({ proof_url: null })
    .eq('id', row.id);
  if (!updErr) rowsCleared += 1;
}

let objectsRemoved = 0;
for (const [bucket, paths] of pathsByBucket) {
  if (paths.size === 0) continue;
  const { error: removeErr } = await supabase.storage.from(bucket).remove([...paths]);
  if (removeErr) console.warn(`${bucket} remove:`, removeErr.message);
  else {
    objectsRemoved += paths.size;
    console.log(`Removed ${paths.size} object(s) from ${bucket}.`);
  }
}

console.log(
  `Done. Cleared proof_url on ${rowsCleared} completion row(s); removed ${objectsRemoved} storage object(s).`,
);
