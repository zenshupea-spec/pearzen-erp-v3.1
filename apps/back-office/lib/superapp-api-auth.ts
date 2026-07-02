import { NextResponse } from 'next/server';

/**
 * Pears super-app export API auth (R-SUPERAPP-01).
 *
 * `SUPERAPP_EXPORT_SERVICE_TOKEN` is a **platform secret** — Pears sync egress only.
 * Never expose in browser, mobile apps, or tenant-facing code.
 *
 * Rotate: npm run rotate:superapp-export-token
 * Then update Vercel production + Pears sync client in the same maintenance window.
 */

export function readSuperappServiceToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return request.headers.get('x-superapp-service-token')?.trim() ?? null;
}

export function assertSuperappServiceToken(request: Request): NextResponse | null {
  const expected = process.env.SUPERAPP_EXPORT_SERVICE_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      {
        error: 'superapp_export_not_configured',
        message: 'SUPERAPP_EXPORT_SERVICE_TOKEN is not configured on this deploy.',
      },
      { status: 503 },
    );
  }

  const provided = readSuperappServiceToken(request);
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid or missing service token.' },
      { status: 401 },
    );
  }

  return null;
}
