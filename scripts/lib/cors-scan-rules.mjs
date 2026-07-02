/** CORS scan rules — R-CORS-01 */

export const CORS_SCAN_DOC_ALLOWLIST = new Set([
  'Audit_Plan.md',
  'CVS_REMEDIATION_STEPS.md',
  'audit-evidence/cvs/remediation-backlog-v1.csv',
  'docs/runbooks/pwa-cors-policy.md',
  'packages/pwa-cors/index.ts',
  'apps/back-office/lib/pwa-cors.test.ts',
  'scripts/lib/cors-scan-rules.mjs',
]);

export const CORS_SCAN_PATH_PREFIXES = [
  'apps/field-pwa/',
  'apps/sm-pwa/',
  'apps/client-pwa/',
  'packages/pwa-cors/',
];

export const FORBIDDEN_WILDCARD_ACAO =
  /Access-Control-Allow-Origin(?:\s*[:=]\s*['"]?\*|['"]\s*,\s*['"]?\*)/i;

export function shouldScanPathForCors(relPath) {
  if (CORS_SCAN_DOC_ALLOWLIST.has(relPath)) return false;
  if (!CORS_SCAN_PATH_PREFIXES.some((prefix) => relPath.startsWith(prefix))) return false;
  if (relPath.endsWith('.test.ts') || relPath.endsWith('.test.mjs')) return false;
  return true;
}

export function scanLineForForbiddenCors(line, filePath) {
  if (!FORBIDDEN_WILDCARD_ACAO.test(line)) return null;
  if (/never be wildcard|must never|never `\*`/i.test(line)) return null;
  return {
    filePath,
    message: 'Access-Control-Allow-Origin must never be wildcard (*).',
    line: line.trim(),
  };
}

export function scanTextForForbiddenCors(content, filePath) {
  const hits = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const hit = scanLineForForbiddenCors(lines[i], filePath);
    if (hit) hits.push({ ...hit, lineNumber: i + 1 });
  }
  return hits;
}
