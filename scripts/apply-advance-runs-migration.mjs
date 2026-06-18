#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../packages/supabase/migrations/20260610230000_advance_runs.sql'),
  'utf8',
);

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('Set DATABASE_URL or SUPABASE_DB_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log('advance_runs migration applied.');
} finally {
  await client.end();
}
