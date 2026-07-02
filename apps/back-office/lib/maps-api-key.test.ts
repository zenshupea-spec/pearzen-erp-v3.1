import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveGoogleMapsBrowserKey } from './maps-api-key';

describe('resolveGoogleMapsBrowserKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns NEXT_PUBLIC_GOOGLE_MAPS_API_KEY when set', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'AIza-public-key');
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'AIza-server-only');
    expect(resolveGoogleMapsBrowserKey()).toBe('AIza-public-key');
  });

  it('never exposes server-only GOOGLE_MAPS_API_KEY', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'AIza-server-only');
    expect(resolveGoogleMapsBrowserKey()).toBeNull();
  });

  it('returns null when unset', () => {
    vi.unstubAllEnvs();
    expect(resolveGoogleMapsBrowserKey()).toBeNull();
  });
});
