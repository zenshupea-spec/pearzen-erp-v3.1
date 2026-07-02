import { describe, expect, it } from 'vitest';

import { resolveShalomPublicAppPrefix, shalomPublicHref } from './shalom-public-path';

describe('shalom-public-path', () => {
  it('prefixes guest routes on local shalom-public mount', () => {
    expect(shalomPublicHref('/properties/villa', '/shalom-public')).toBe(
      '/shalom-public/properties/villa',
    );
    expect(shalomPublicHref('/book/villa', '/shalom-public/properties/villa')).toBe(
      '/shalom-public/book/villa',
    );
  });

  it('uses clean URLs on the public host', () => {
    expect(shalomPublicHref('/properties/villa', '/properties/villa')).toBe('/properties/villa');
    expect(resolveShalomPublicAppPrefix('/properties/villa')).toBe('');
  });

  it('defaults to shalom-public mount in dev when pathname is unknown', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_SHALOM_PUBLIC_APP_PREFIX;

    expect(shalomPublicHref('/book/villa')).toBe('/shalom-public/book/villa');

    process.env.NODE_ENV = originalEnv;
  });
});
