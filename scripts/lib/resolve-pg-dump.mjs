/** Resolve pg_dump binary — PATH, PG_DUMP env, or repo-local .tools bundle. */

import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BUNDLED = join(ROOT, '.tools/pgsql/bin/pg_dump');

export function resolvePgDumpPath() {
  const explicit = process.env.PG_DUMP?.trim();
  if (explicit && existsSync(explicit)) return explicit;
  if (spawnSync('pg_dump', ['--version'], { encoding: 'utf8' }).status === 0) return 'pg_dump';
  if (existsSync(BUNDLED)) return BUNDLED;
  return null;
}

export function pgDumpAvailable() {
  return resolvePgDumpPath() !== null;
}
