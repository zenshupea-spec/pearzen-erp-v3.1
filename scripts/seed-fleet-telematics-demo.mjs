/**
 * Simulates a flagged fleet trip by POSTing telematics pings to the webhook.
 * Requires: registered asset tag_id, FLEET_TELEMATICS_WEBHOOK_SECRET, back-office running.
 *
 * Run: npm run seed:fleet-telematics -- GT-00821
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

loadEnv();

const tagId = process.argv[2]?.trim();
if (!tagId) {
  console.error('Usage: npm run seed:fleet-telematics -- <GPS_TAG_ID>');
  process.exit(1);
}

const secret = process.env.FLEET_TELEMATICS_WEBHOOK_SECRET?.trim();
if (!secret) {
  console.error('Set FLEET_TELEMATICS_WEBHOOK_SECRET in apps/back-office/.env.local');
  process.exit(1);
}

const port = process.env.NEXT_PUBLIC_BACK_OFFICE_PORT || '3002';
const baseUrl = `http://127.0.0.1:${port}`;

/** Nawala → Galle Face (fast / flagged) */
const route = [
  { lat: 6.9068, lng: 79.8885, speed: 18, offsetMin: 0, label: 'Nawala (HQ Office)' },
  { lat: 6.9025, lng: 79.8720, speed: 62, offsetMin: 1, label: 'Rajagiriya' },
  { lat: 6.8960, lng: 79.8550, speed: 74, offsetMin: 2, label: 'Borella approach' },
  { lat: 6.9275, lng: 79.8420, speed: 68, offsetMin: 3, label: 'Galle Face Green, Colombo 03' },
  { lat: 6.9275, lng: 79.8420, speed: 0, offsetMin: 4, label: 'Galle Face Green, Colombo 03' },
  { lat: 6.9275, lng: 79.8420, speed: 0, offsetMin: 7, label: 'Galle Face Green, Colombo 03' },
];

async function postPing(point, index) {
  const recordedAt = new Date(Date.now() + point.offsetMin * 60_000).toISOString();
  const res = await fetch(`${baseUrl}/api/fleet/telematics`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tag_id: tagId,
      latitude: point.lat,
      longitude: point.lng,
      speed_kmh: point.speed,
      location_label: point.label,
      recorded_at: recordedAt,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Ping ${index + 1} failed (${res.status})`);
  }
  console.log(`Ping ${index + 1}/${route.length}: ${point.label} @ ${point.speed} km/h`);
}

for (let i = 0; i < route.length; i++) {
  await postPing(route[i], i);
  await new Promise((r) => setTimeout(r, 150));
}

console.log('✅ Fleet telematics demo route sent. Refresh /executive/fleet to see flagged trip.');
