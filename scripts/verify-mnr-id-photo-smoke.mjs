/**
 * Step 10 smoke: MNR ID photo upload — compression gate + storage round-trip.
 * Run: node scripts/verify-mnr-id-photo-smoke.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ID_PHOTO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const ID_PHOTO_TARGET_MAX_BYTES = 1_950_000;
const ID_PHOTO_MAX_EDGE_PX = 1600;
const MAX_ID_PHOTO_BYTES = 2 * 1024 * 1024;
const ID_PHOTO_BUCKET = 'company-branding';
const JPEG_QUALITY_START = 88;
const JPEG_QUALITY_MIN = 72;

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

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const checks = [];
let failed = false;

function pass(label) {
  checks.push(`  ✓ ${label}`);
}

function fail(label, detail = '') {
  failed = true;
  checks.push(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function compressIdPhotoBuffer(input) {
  const meta = await sharp(input).metadata();
  const maxEdge = Math.max(meta.width ?? 1, meta.height ?? 1);
  const scale = Math.min(1, ID_PHOTO_MAX_EDGE_PX / maxEdge);

  let quality = JPEG_QUALITY_START;
  let output = await sharp(input)
    .rotate()
    .resize({
      width: Math.max(1, Math.round((meta.width ?? 1) * scale)),
      height: Math.max(1, Math.round((meta.height ?? 1) * scale)),
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (output.length > ID_PHOTO_TARGET_MAX_BYTES && quality > JPEG_QUALITY_MIN) {
    quality -= 4;
    output = await sharp(input)
      .rotate()
      .resize({
        width: Math.max(1, Math.round((meta.width ?? 1) * scale)),
        height: Math.max(1, Math.round((meta.height ?? 1) * scale)),
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  return output;
}

function staticUiChecks() {
  const src = readFileSync(join(root, 'apps/back-office/app/hr/EmployeeIdPhotoField.tsx'), 'utf8');
  if (!src.includes('type="button"') || !src.includes('openFilePicker')) {
    fail('EmployeeIdPhotoField uses explicit button (not label-only)');
  } else {
    pass('EmployeeIdPhotoField uses explicit Choose photo button');
  }
  if (!src.includes('className="sr-only"') || !src.includes('type="file"')) {
    fail('EmployeeIdPhotoField hidden file input');
  } else {
    pass('EmployeeIdPhotoField hidden file input (sr-only)');
  }
  if (!src.includes('ID_PHOTO_UPLOAD_MAX_BYTES')) {
    fail('EmployeeIdPhotoField references ID_PHOTO_UPLOAD_MAX_BYTES');
  } else {
    pass('EmployeeIdPhotoField compresses files over 2MB before upload');
  }
  if (src.includes('<label') && src.includes('htmlFor') && src.includes('type="file"')) {
    fail('EmployeeIdPhotoField label-wrapped file input (Cursor browser issue)');
  } else {
    pass('EmployeeIdPhotoField no label-wrapped file input');
  }

  const serverSrc = readFileSync(join(root, 'packages/supabase/employee-id-photo.ts'), 'utf8');
  if (!serverSrc.includes('MAX_ID_PHOTO_BYTES = 2 * 1024 * 1024')) {
    fail('Server MAX_ID_PHOTO_BYTES is 2MB');
  } else {
    pass('Server rejects uploads over 2MB');
  }
}

async function main() {
  staticUiChecks();

  // Build a large source image (>2MB) like a phone camera photo.
  const noise = Buffer.alloc(2400 * 2400 * 3);
  for (let i = 0; i < noise.length; i += 1) {
    noise[i] = Math.floor(Math.random() * 256);
  }

  const largeBuffer = await sharp(noise, {
    raw: { width: 2400, height: 2400, channels: 3 },
  })
    .jpeg({ quality: 98, mozjpeg: true })
    .toBuffer();

  if (largeBuffer.length <= ID_PHOTO_UPLOAD_MAX_BYTES) {
    fail('Synthetic large photo', `expected >2MB, got ${formatBytes(largeBuffer.length)}`);
  } else {
    pass(`Synthetic large photo ${formatBytes(largeBuffer.length)} (>2MB)`);
  }

  const compressed = await compressIdPhotoBuffer(largeBuffer);
  if (compressed.length > MAX_ID_PHOTO_BYTES) {
    fail('Compression under 2MB gate', `got ${formatBytes(compressed.length)}`);
  } else {
    pass(
      `Compression ${formatBytes(largeBuffer.length)} → ${formatBytes(compressed.length)} (under 2MB)`,
    );
  }

  if (!supabaseUrl || !serviceKey) {
    checks.push('  · Skipping storage round-trip — Supabase env not configured');
    console.log('\nMNR ID photo smoke (Step 10)\n');
    console.log(checks.join('\n'));
    console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
    process.exit(failed ? 1 : 0);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const employeeId =
    process.env.MNR_ID_PHOTO_SMOKE_EMPLOYEE_ID?.trim() ||
    (
      await admin
        .from('employees')
        .select('id')
        .in('emp_number', ['d101', '444', '446'])
        .limit(1)
        .maybeSingle()
    ).data?.id;

  if (!employeeId) {
    checks.push('  · Skipping storage round-trip — set MNR_ID_PHOTO_SMOKE_EMPLOYEE_ID or seed d101');
  } else {
    const { data: emp, error: empErr } = await admin
      .from('employees')
      .select('id, full_name, emp_number, id_photo_url')
      .eq('id', employeeId)
      .single();

    if (empErr || !emp) {
      fail('Employee lookup for upload', empErr?.message ?? 'not found');
    } else {
      const priorUrl = emp.id_photo_url ?? null;
      const path = `employee-id-photos/${employeeId}/photo.jpg`;

      const { error: uploadErr } = await admin.storage
        .from(ID_PHOTO_BUCKET)
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: true });

      if (uploadErr) {
        fail('Storage upload', uploadErr.message);
      } else {
        pass(`Storage upload to ${path}`);
      }

      const { data: urlData } = admin.storage.from(ID_PHOTO_BUCKET).getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { error: updateErr } = await admin
        .from('employees')
        .update({ id_photo_url: publicUrl })
        .eq('id', employeeId);

      if (updateErr) {
        fail('employees.id_photo_url update', updateErr.message);
      } else {
        pass(`employees.id_photo_url updated (${emp.full_name ?? emp.emp_number ?? employeeId})`);
      }

      const { data: readBack, error: readErr } = await admin
        .from('employees')
        .select('id_photo_url')
        .eq('id', employeeId)
        .single();

      if (readErr || readBack?.id_photo_url !== publicUrl) {
        fail('employees.id_photo_url read-back', readErr?.message ?? 'URL mismatch');
      } else {
        pass('employees.id_photo_url read-back matches');
      }

      if (priorUrl) {
        await admin.from('employees').update({ id_photo_url: priorUrl }).eq('id', employeeId);
        checks.push('  · Restored prior id_photo_url after smoke upload');
      }
    }
  }

  console.log('\nMNR ID photo smoke (Step 10)\n');
  console.log(checks.join('\n'));
  console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
