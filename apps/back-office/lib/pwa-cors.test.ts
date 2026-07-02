import { describe, expect, it } from 'vitest';

import {
  enforcePwaCorsOnRequest,
  handlePwaCorsPreflight,
  isPwaCorsAllowedOrigin,
  resolvePwaCorsAllowlist,
  scanLineForForbiddenPwaCors,
  withPwaCors,
} from '../../../packages/pwa-cors/index';

describe('resolvePwaCorsAllowlist', () => {
  it('includes CVS production hosts and localhost dev ports', () => {
    const list = resolvePwaCorsAllowlist({});
    expect(list).toContain('https://cv.pearzen.tech');
    expect(list).toContain('https://cvssm.pearzen.tech');
    expect(list).toContain('http://127.0.0.1:3001');
    expect(list).toContain('http://127.0.0.1:3003');
    expect(list).toContain('http://127.0.0.1:3000');
  });

  it('adds LAN dev HTTPS origins when LAN_DEV_ORIGIN is a bare IP', () => {
    const list = resolvePwaCorsAllowlist({ LAN_DEV_ORIGIN: '192.168.1.42' });
    expect(list).toContain('https://192.168.1.42:3001');
    expect(list).toContain('https://192.168.1.42:3003');
  });
});

describe('withPwaCors', () => {
  it('allows same-origin requests without Origin header', async () => {
    const handler = withPwaCors(async () => Response.json({ ok: true }));
    const res = await handler(new Request('http://127.0.0.1:3001/api/time'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('returns 403 for disallowed cross-origin POST', async () => {
    const handler = withPwaCors(async () => Response.json({ ok: true }));
    const res = await handler(
      new Request('http://127.0.0.1:3001/api/auth/emp-login', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 for disallowed cross-origin OPTIONS', async () => {
    const handler = withPwaCors(async () => Response.json({ ok: true }));
    const res = await handler(
      new Request('http://127.0.0.1:3001/api/auth/emp-login', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('sets explicit ACAO for allowlisted cross-origin requests', async () => {
    const handler = withPwaCors(async () => Response.json({ ok: true }));
    const origin = 'https://cv.pearzen.tech';
    const res = await handler(
      new Request('http://127.0.0.1:3001/api/time', {
        method: 'GET',
        headers: { Origin: origin },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  });

  it('preflight succeeds for allowlisted origin', () => {
    const origin = 'https://cvssm.pearzen.tech';
    const res = handlePwaCorsPreflight(
      new Request('http://127.0.0.1:3003/api/auth/sm-login', {
        method: 'OPTIONS',
        headers: { Origin: origin },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  });
});

describe('scanLineForForbiddenPwaCors', () => {
  it('flags wildcard Access-Control-Allow-Origin', () => {
    expect(
      scanLineForForbiddenPwaCors("headers.set('Access-Control-Allow-Origin', '*')", 'route.ts'),
    ).not.toBeNull();
  });
});

describe('isPwaCorsAllowedOrigin', () => {
  it('treats missing Origin as allowed (same-origin / non-browser)', () => {
    expect(isPwaCorsAllowedOrigin(null)).toBe(true);
  });
});

describe('enforcePwaCorsOnRequest', () => {
  it('does not block requests without Origin', () => {
    expect(
      enforcePwaCorsOnRequest(new Request('http://127.0.0.1:3001/api/time')),
    ).toBeNull();
  });
});
