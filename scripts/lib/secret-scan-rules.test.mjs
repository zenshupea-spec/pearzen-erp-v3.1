import { describe, expect, it } from 'vitest';

import {
  lintTrackedEnvProductionContent,
  lintTrackedEnvProductionLine,
  scanLineForSecrets,
  scanTextForSecrets,
} from './secret-scan-rules.mjs';

describe('lintTrackedEnvProductionLine', () => {
  it('allows NEXT_PUBLIC_* keys', () => {
    expect(lintTrackedEnvProductionLine('NEXT_PUBLIC_TENANT_BASE_DOMAIN=pearzen.tech', 1)).toBeNull();
  });

  it('rejects server secrets in tracked production env', () => {
    expect(lintTrackedEnvProductionLine('RESEND_API_KEY=re_live_example', 2)?.message).toMatch(
      /Forbidden server secret/,
    );
    expect(lintTrackedEnvProductionLine('SUPABASE_SERVICE_ROLE_KEY=eyJabc', 3)?.message).toMatch(
      /Forbidden server secret/,
    );
  });

  it('rejects non-public keys without NEXT_PUBLIC prefix', () => {
    expect(lintTrackedEnvProductionLine('FORGE_HOST=forge.pearzen.tech', 4)?.message).toMatch(
      /NEXT_PUBLIC_\* only/,
    );
  });
});

describe('scanLineForSecrets', () => {
  it('detects fake Supabase service role JWT assignments', () => {
    const line =
      'SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig';
    const hits = scanLineForSecrets(line, 'leak.env');
    expect(hits.some((h) => h.pattern === 'supabase-service-role-jwt')).toBe(true);
  });

  it('detects Resend and Stripe live keys', () => {
    expect(scanLineForSecrets('RESEND_API_KEY=re_123456789012345678901234', 'x').length).toBeGreaterThan(0);
    expect(scanLineForSecrets('STRIPE=sk_live_1234567890abcdef', 'x').length).toBeGreaterThan(0);
  });

  it('ignores documentation example lines', () => {
    expect(
      scanLineForSecrets("PR with fake `SUPABASE_SERVICE_ROLE_KEY=eyJ…` in any file", 'doc.md'),
    ).toEqual([]);
  });
});

describe('lintTrackedEnvProductionContent', () => {
  it('passes current public-only production env shape', () => {
    const sample = `# Public build-time vars for Vercel production (no secrets).
NEXT_PUBLIC_TENANT_BASE_DOMAIN=pearzen.tech
NEXT_PUBLIC_FORGE_HOST=forge.pearzen.tech
`;
    expect(lintTrackedEnvProductionContent(sample)).toEqual([]);
  });
});

describe('scanTextForSecrets allowlist', () => {
  it('skips audit markdown with pattern mentions', () => {
    const content =
      'PR with fake SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig';
    expect(scanTextForSecrets(content, 'Audit_Plan.md')).toEqual([]);
  });
});
