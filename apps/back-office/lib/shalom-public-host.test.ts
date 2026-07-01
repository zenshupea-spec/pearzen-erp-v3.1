import { describe, expect, it } from 'vitest';

import {
  isShalomPublicHost,
  isShalomPublicPolicyPath,
  shalomPublicInternalPath,
} from './shalom-public-host';

describe('shalom-public-host', () => {
  it('recognises shalom.pearzen.tech', () => {
    expect(isShalomPublicHost('shalom.pearzen.tech')).toBe(true);
    expect(isShalomPublicHost('www.shalom.pearzen.tech')).toBe(true);
    expect(isShalomPublicHost('cvshq.pearzen.tech')).toBe(false);
  });

  it('maps clean policy URLs to internal routes', () => {
    expect(isShalomPublicPolicyPath('/refund-policy')).toBe(true);
    expect(shalomPublicInternalPath('/refund-policy')).toBe('/shalom-public/refund-policy');
    expect(shalomPublicInternalPath('/privacy-policy')).toBe('/shalom-public/privacy-policy');
    expect(shalomPublicInternalPath('/terms-and-conditions')).toBe(
      '/shalom-public/terms-and-conditions',
    );
    expect(shalomPublicInternalPath('/')).toBe('/shalom-public');
  });
});
