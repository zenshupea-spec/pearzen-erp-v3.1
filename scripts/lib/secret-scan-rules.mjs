/** Shared secret-scan rules — R-SECRETS-01 */

/** Tracked `.env.production` may only contain `NEXT_PUBLIC_*` assignments. */
export const TRACKED_ENV_PRODUCTION_PATH = 'apps/back-office/.env.production';

export const ALLOWED_TRACKED_PRODUCTION_ENV_PREFIX = 'NEXT_PUBLIC_';

/** Server-only keys that must never appear in tracked production env files. */
export const FORBIDDEN_TRACKED_PRODUCTION_ENV_KEYS = new Set([
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'DATABASE_URL',
  'SUPABASE_DB_PASSWORD',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'ENCRYPTION_KEY',
  'PORTAL_PIN_COOKIE_SECRET',
  'PORTAL_TOTP_ENCRYPTION_SECRET',
  'CRON_SECRET',
  'SUPERAPP_EXPORT_SERVICE_TOKEN',
  'FLEET_TELEMATICS_WEBHOOK_SECRET',
  'VERCEL_TOKEN',
  'PORKBUN_SECRET_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'FIELD_PWA_AUTH_PASSWORD',
  'CAFE_FRONT_AUTH_PASSWORD',
  'PAYHERE_MERCHANT_SECRET',
]);

/** High-confidence secret patterns in tracked source / docs. */
export const SECRET_PATTERNS = [
  {
    id: 'supabase-service-role-jwt',
    regex: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  },
  {
    id: 'jwt-token',
    regex: /(?<![A-Za-z0-9_./-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  },
  {
    id: 'resend-api-key',
    regex: /\bre_[A-Za-z0-9]{20,}\b/,
  },
  {
    id: 'stripe-live-key',
    regex: /\bsk_live_[A-Za-z0-9]{10,}\b/,
  },
  {
    id: 'resend-webhook-secret',
    regex: /\bwhsec_[A-Za-z0-9]{10,}\b/,
  },
];

/** Paths where documentation may mention pattern names without scanning line content. */
export const SECRET_SCAN_DOC_ALLOWLIST = new Set([
  'Audit_Plan.md',
  'CVS_REMEDIATION_STEPS.md',
  'audit-evidence/cvs/remediation-backlog-v1.csv',
]);

export const SECRET_SCAN_SKIP_SUFFIXES = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.tar',
  '.zst',
  '.pdf',
  '.tsbuildinfo',
]);

export function isDocumentationExampleLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) return true;
  if (trimmed.includes('eyJ…') || trimmed.includes('eyJ...')) return true;
  if (/git log -S/.test(trimmed)) return true;
  if (/PR with fake/.test(trimmed)) return true;
  if (/blocking JWT/.test(trimmed)) return true;
  return false;
}

export function lintTrackedEnvProductionLine(line, lineNumber) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const eq = trimmed.indexOf('=');
  if (eq <= 0) {
    return { lineNumber, message: `Malformed env line: ${trimmed}` };
  }

  const key = trimmed.slice(0, eq).trim();
  if (FORBIDDEN_TRACKED_PRODUCTION_ENV_KEYS.has(key)) {
    return {
      lineNumber,
      message: `Forbidden server secret key "${key}" in tracked .env.production`,
    };
  }

  if (!key.startsWith(ALLOWED_TRACKED_PRODUCTION_ENV_PREFIX)) {
    return {
      lineNumber,
      message: `Tracked .env.production allows NEXT_PUBLIC_* only — found "${key}"`,
    };
  }

  return null;
}

export function lintTrackedEnvProductionContent(content, filePath = TRACKED_ENV_PRODUCTION_PATH) {
  const violations = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const hit = lintTrackedEnvProductionLine(lines[i], i + 1);
    if (hit) violations.push({ file: filePath, ...hit });
  }
  return violations;
}

export function scanLineForSecrets(line, filePath) {
  if (isDocumentationExampleLine(line)) return [];

  const hits = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(line)) {
      hits.push({ file: filePath, pattern: pattern.id, line: line.trim().slice(0, 120) });
    }
  }
  return hits;
}

export function scanTextForSecrets(content, filePath) {
  if (SECRET_SCAN_DOC_ALLOWLIST.has(filePath)) return [];

  const hits = [];
  const lines = content.split('\n');
  for (const line of lines) {
    hits.push(...scanLineForSecrets(line, filePath));
  }
  return hits;
}

export function shouldSkipSecretScanPath(filePath) {
  for (const suffix of SECRET_SCAN_SKIP_SUFFIXES) {
    if (filePath.endsWith(suffix)) return true;
  }
  if (filePath.includes('node_modules/')) return true;
  if (filePath.includes('.turbo/cache/')) return true;
  return false;
}
