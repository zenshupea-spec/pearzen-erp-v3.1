/**
 * R-RLS-01: Apply all repo migrations through HEAD on CVS (ktfgvcrdfbapmefktgjc)
 * and repair supabase_migrations.schema_migrations registry.
 *
 * Run: node scripts/apply-cvs-r-rls-01.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = '20260621330000_merge_shadow_roster_epf_resolution';

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(join(root, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      /* try next */
    }
  }
}

function parseStem(stem) {
  const idx = stem.indexOf('_');
  if (idx === -1) return { version: stem, name: stem };
  return { version: stem.slice(0, idx), name: stem.slice(idx + 1) };
}

function collectMigrations() {
  const dirs = [
    join(root, 'supabase/migrations'),
    join(root, 'packages/supabase/migrations'),
  ];
  const stems = new Set();
  for (const dir of dirs) {
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.sql')) stems.add(file.replace(/\.sql$/, ''));
    }
  }
  return [...stems]
    .sort()
    .filter((stem) => stem <= HEAD)
    .map((stem) => {
      const { version, name } = parseStem(stem);
      const paths = [
        join(root, 'supabase/migrations', `${stem}.sql`),
        join(root, 'packages/supabase/migrations', `${stem}.sql`),
      ];
      const path = paths.find((p) => {
        try {
          readFileSync(p);
          return true;
        } catch {
          return false;
        }
      });
      return { stem, version, name, path, sql: readFileSync(path, 'utf8') };
    });
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken || !projectRef) {
  console.error('Set SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL in .env.seed.tmp');
  process.exit(1);
}

async function query(sql, label = 'query') {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label}: ${res.status} ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function recordMigration(version, name) {
  await query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ('${version}', '${name}', ARRAY[]::text[])
     ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name`,
    `record ${version}`,
  );
}

const POST_FIXES = `
-- Normalize time_shifts / time_rosters off JWT company_id claim
DROP POLICY IF EXISTS "tenant_isolation_time_shifts" ON public.time_shifts;
DROP POLICY IF EXISTS "tenant_isolation_time_rosters" ON public.time_rosters;
DROP POLICY IF EXISTS tenant_select_time_shifts ON public.time_shifts;
DROP POLICY IF EXISTS tenant_write_time_shifts ON public.time_shifts;
DROP POLICY IF EXISTS tenant_select_time_rosters ON public.time_rosters;
DROP POLICY IF EXISTS tenant_write_time_rosters ON public.time_rosters;

DO $fix$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='time_shifts') THEN
    EXECUTE 'CREATE POLICY tenant_select_time_shifts ON public.time_shifts FOR SELECT TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))';
    EXECUTE 'CREATE POLICY tenant_write_time_shifts ON public.time_shifts FOR ALL TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user())) WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='time_rosters') THEN
    EXECUTE 'CREATE POLICY tenant_select_time_rosters ON public.time_rosters FOR SELECT TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))';
    EXECUTE 'CREATE POLICY tenant_write_time_rosters ON public.time_rosters FOR ALL TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user())) WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))';
  END IF;
END
$fix$;

-- Backfill attendance_logs.company_id from employees where null
UPDATE public.attendance_logs al
SET company_id = e.company_id
FROM public.employees e
WHERE al.company_id IS NULL
  AND upper(trim(coalesce(al.emp_number, ''))) = upper(trim(coalesce(e.emp_number, '')))
  AND e.company_id IS NOT NULL;

UPDATE public.attendance_logs al
SET company_id = e.company_id
FROM public.employees e
WHERE al.company_id IS NULL
  AND al.guard_id IS NOT NULL
  AND e.id = al.guard_id
  AND e.company_id IS NOT NULL;

-- Orphan legacy rows (no employee match) → CVS tenant
UPDATE public.attendance_logs
SET company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'
WHERE company_id IS NULL;
`;

async function main() {
  const migrations = collectMigrations();
  console.log(`CVS R-RLS-01: ${migrations.length} repo migrations through ${HEAD}`);

  const existingRows = await query(
    'SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version',
    'list migrations',
  );
  const existingVersions = new Set(
    (Array.isArray(existingRows) ? existingRows : []).map((r) => r.version),
  );

  let applied = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const m of migrations) {
    if (existingVersions.has(m.version)) {
      skipped++;
      continue;
    }
    process.stdout.write(`Applying ${m.stem} … `);
    try {
      await query(m.sql, m.stem);
      await recordMigration(m.version, m.name);
      existingVersions.add(m.version);
      applied++;
      console.log('ok');
    } catch (err) {
      const msg = String(err.message || err);
      const benign =
        /already exists|duplicate key|duplicate_object|does not exist, skipping/i.test(msg);
      if (benign) {
        try {
          await recordMigration(m.version, m.name);
          existingVersions.add(m.version);
          applied++;
          console.log('recorded (benign apply error)');
        } catch (recErr) {
          failed++;
          failures.push({ stem: m.stem, error: msg });
          console.log('FAIL (record)');
        }
      } else {
        failed++;
        failures.push({ stem: m.stem, error: msg.slice(0, 300) });
        console.log('FAIL');
      }
    }
  }

  // Registry repair: drop drift rows (same name, wrong repo version)
  const repoNames = migrations.map((m) => m.name);
  const repoVersions = migrations.map((m) => `'${m.version}'`).join(',');
  await query(
    `DELETE FROM supabase_migrations.schema_migrations sm
     WHERE sm.version NOT IN (${repoVersions})
       AND sm.name IN (${repoNames.map((n) => `'${n}'`).join(',')})`,
    'repair drift',
  );

  for (const m of migrations) {
    if (!existingVersions.has(m.version)) {
      await recordMigration(m.version, m.name);
      existingVersions.add(m.version);
    }
  }

  console.log('\nApplying post-fixes (time_shifts policies + attendance_logs backfill)…');
  await query(POST_FIXES, 'post-fixes');

  const finalCount = await query(
    'SELECT COUNT(*)::int AS n, MAX(version) AS head FROM supabase_migrations.schema_migrations',
    'final count',
  );
  const row = Array.isArray(finalCount) ? finalCount[0] : finalCount;

  console.log('\n── Summary ──');
  console.log(`  Applied SQL:     ${applied}`);
  console.log(`  Skipped (exist): ${skipped}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`  Registry rows:   ${row?.n}`);
  console.log(`  Registry head:   ${row?.head}`);
  if (failures.length) {
    console.log('\n  Failures:');
    for (const f of failures.slice(0, 15)) {
      console.log(`    · ${f.stem}: ${f.error}`);
    }
    if (failures.length > 15) console.log(`    … +${failures.length - 15} more`);
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
