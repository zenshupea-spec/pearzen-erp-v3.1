#!/usr/bin/env node
/**
 * Download PostgreSQL client binaries into .tools/pgsql (macOS arm64/x64).
 * GitHub Actions installs postgresql-client via apt instead.
 *
 * Run: npm run bootstrap:pg-dump-client
 */

import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { spawnSync } from 'child_process';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, '.tools');
const PG_DUMP = join(TOOLS, 'pgsql/bin/pg_dump');
const ZIP_URL = 'https://get.enterprisedb.com/postgresql/postgresql-16.6-1-osx-binaries.zip';
const ZIP_PATH = join(TOOLS, 'pg16-binaries.zip');

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function main() {
  if (existsSync(PG_DUMP)) {
    const v = spawnSync(PG_DUMP, ['--version'], { encoding: 'utf8' });
    console.log(`pg_dump already present: ${(v.stdout || v.stderr).trim()}`);
    process.exit(0);
  }

  mkdirSync(TOOLS, { recursive: true });
  console.log('Downloading PostgreSQL 16 client binaries (~320 MB)…');
  await download(ZIP_URL, ZIP_PATH);
  console.log('Extracting…');
  execSync(`unzip -q -o "${ZIP_PATH}" -d "${TOOLS}"`, { stdio: 'inherit' });

  if (!existsSync(PG_DUMP)) {
    console.error('Extract completed but pg_dump not found under .tools/pgsql/bin');
    process.exit(1);
  }

  const v = spawnSync(PG_DUMP, ['--version'], { encoding: 'utf8' });
  console.log(`Ready: ${(v.stdout || v.stderr).trim()}`);
  console.log(`Path: ${PG_DUMP}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
