#!/usr/bin/env node
/**
 * C-6 — Archive CVS legacy source files to gitignored secure storage.
 * Run: npm run migrate:cvs-legacy:archive
 *
 * Copies (then moves) operator Downloads sources into:
 *   data/migration/classic-venture/archive/legacy-sources/
 * Writes manifest with SHA-256 checksums (no PII content).
 */

import { createHash } from 'crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const archiveDir = join(outDir, 'archive/legacy-sources');

const SOURCES = [
  {
    envKey: 'CVS_MNR_XLSX',
    defaultPath: join(process.env.HOME ?? '', 'Downloads/MASTER NOMINAL ROLL.xlsx'),
    archiveName: 'MASTER-NOMINAL-ROLL.xlsx',
  },
  {
    envKey: 'CVS_SITES_XLS',
    defaultPath: join(process.env.HOME ?? '', 'Downloads/SITE CODE AND NAMES.xls'),
    archiveName: 'SITE-CODE-AND-NAMES.xls',
  },
];

function sha256File(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      /* skip */
    }
  }
}

function resolveSource(entry) {
  return process.env[entry.envKey] || entry.defaultPath;
}

async function main() {
  loadEnv();
  mkdirSync(archiveDir, { recursive: true });

  const manifest = [];
  manifest.push(`CVS legacy source archive — ${new Date().toISOString()}`);
  manifest.push(`Archive path: ${archiveDir}`);
  manifest.push('');
  manifest.push('ACCESS: PII — local operator machine only. Never commit to git.');
  manifest.push('');

  for (const entry of SOURCES) {
    const src = resolveSource(entry);
    const dest = join(archiveDir, entry.archiveName);

    if (!existsSync(src)) {
      if (existsSync(dest)) {
        const st = statSync(dest);
        manifest.push(`[already archived] ${entry.archiveName}`);
        manifest.push(`  size: ${st.size} bytes`);
        manifest.push(`  sha256: ${sha256File(dest)}`);
        manifest.push('');
        continue;
      }
      throw new Error(`Source not found: ${src}`);
    }

    copyFileSync(src, dest);
    const hash = sha256File(dest);
    const size = statSync(dest).size;

    manifest.push(`[archived] ${basename(src)} → ${entry.archiveName}`);
    manifest.push(`  original: ${src}`);
    manifest.push(`  size: ${size} bytes`);
    manifest.push(`  sha256: ${hash}`);
    manifest.push('');

    try {
      unlinkSync(src);
      manifest.push(`  removed from Downloads: ${src}`);
    } catch {
      manifest.push(`  note: could not remove original (leave in Downloads manually)`);
    }
    manifest.push('');
  }

  manifest.push('Staging artifacts (same parent folder, gitignored):');
  manifest.push('  pearzen-bulk-import-CLASSIC-VENTURE-STAGING.xlsx');
  manifest.push('  staging-*.csv, migration-qa-report.txt, c-*-report.txt');
  manifest.push('  operator-review-bundle.txt, cvs-pre-import-baseline-*.json');
  manifest.push('');
  manifest.push('Migration status: COMPLETE (2026-06-26)');

  const manifestPath = join(archiveDir, 'ARCHIVE-MANIFEST.txt');
  writeFileSync(manifestPath, manifest.join('\n') + '\n');

  console.log('CVS legacy archive (C-6)\n');
  console.log(manifest.join('\n'));
  console.log(`\nWrote ${manifestPath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
