/**
 * PWA API CORS guard — R-CORS-01
 *
 * Default production posture: same-origin `/api/*` only (no ACAO headers).
 * When a route opts into `withPwaCors`, cross-origin browser calls outside the
 * allowlist receive 403; allowed origins get explicit ACAO (never `*`).
 */

export const PWA_CORS_PRODUCTION_ORIGINS = [
  'https://cv.pearzen.tech',
  'https://cvssm.pearzen.tech',
] as const;

export const PWA_CORS_LOCALHOST_PORTS = [3000, 3001, 3003] as const;

export type PwaRouteHandler = (request: Request) => Promise<Response> | Response;

function appendLanDevOrigins(origins: Set<string>, env?: NodeJS.ProcessEnv): void {
  const raw = env?.LAN_DEV_ORIGIN?.trim();
  if (!raw) return;

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    origins.add(raw);
    return;
  }

  for (const port of PWA_CORS_LOCALHOST_PORTS) {
    origins.add(`https://${raw}:${port}`);
    origins.add(`http://${raw}:${port}`);
  }
}

export function resolvePwaCorsAllowlist(env?: NodeJS.ProcessEnv): string[] {
  const resolvedEnv = env ?? process.env;

  const origins = new Set<string>(PWA_CORS_PRODUCTION_ORIGINS);

  for (const port of PWA_CORS_LOCALHOST_PORTS) {
    origins.add(`http://127.0.0.1:${port}`);
    origins.add(`http://localhost:${port}`);
  }

  appendLanDevOrigins(origins, resolvedEnv);
  return [...origins];
}

export function isPwaCorsAllowedOrigin(
  origin: string | null,
  allowlist: readonly string[] = resolvePwaCorsAllowlist(),
): boolean {
  if (!origin) return true;
  return allowlist.includes(origin);
}

export function pwaCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

export function applyPwaCorsHeaders(request: Request, response: Response): Response {
  const origin = request.headers.get('Origin');
  if (!origin || !isPwaCorsAllowedOrigin(origin)) return response;

  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(pwaCorsHeaders(origin))) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handlePwaCorsPreflight(request: Request): Response {
  const origin = request.headers.get('Origin');
  if (!origin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!isPwaCorsAllowedOrigin(origin)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return new Response(null, { status: 204, headers: pwaCorsHeaders(origin) });
}

export function enforcePwaCorsOnRequest(request: Request): Response | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (isPwaCorsAllowedOrigin(origin)) return null;
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

/** Wrap a PWA route handler with allowlisted CORS + cross-origin 403 enforcement. */
export function withPwaCors(handler: PwaRouteHandler): PwaRouteHandler {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') {
      return handlePwaCorsPreflight(request);
    }

    const blocked = enforcePwaCorsOnRequest(request);
    if (blocked) return blocked;

    const response = await handler(request);
    return applyPwaCorsHeaders(request, response);
  };
}

/** CI helper — permissive wildcard ACAO must never ship. */
export const FORBIDDEN_PWA_CORS_WILDCARD =
  /Access-Control-Allow-Origin(?:\s*[:=]\s*['"]?\*|['"]\s*,\s*['"]?\*)/i;

export function scanLineForForbiddenPwaCors(line: string, filePath: string) {
  if (!FORBIDDEN_PWA_CORS_WILDCARD.test(line)) return null;
  return {
    filePath,
    message: 'Access-Control-Allow-Origin must never be wildcard (*); use withPwaCors allowlist.',
    line: line.trim(),
  };
}
