import { describe, expect, it } from 'vitest';

import {
  isShalomPublicHost,
  isShalomPublicInternalPath,
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

  it('maps property browse and detail routes', () => {
    expect(shalomPublicInternalPath('/properties')).toBe('/shalom-public/properties');
    expect(shalomPublicInternalPath('/contact')).toBe('/shalom-public/contact');
    expect(shalomPublicInternalPath('/properties/nawala-garden-villa')).toBe(
      '/shalom-public/properties/nawala-garden-villa',
    );
    expect(shalomPublicInternalPath('/properties/Nawala-Garden-Villa/')).toBe(
      '/shalom-public/properties/nawala-garden-villa',
    );
    expect(shalomPublicInternalPath('/properties/')).toBe('/shalom-public/properties');
  });

  it('maps book and confirmation routes', () => {
    expect(shalomPublicInternalPath('/book/nawala-garden-villa')).toBe(
      '/shalom-public/book/nawala-garden-villa',
    );
    expect(
      shalomPublicInternalPath(
        '/confirmation/29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e',
      ),
    ).toBe('/shalom-public/confirmation/29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e');
  });

  it('passes through existing internal app paths', () => {
    expect(shalomPublicInternalPath('/shalom-public/properties/villa')).toBe(
      '/shalom-public/properties/villa',
    );
  });

  it('rejects unsafe or unknown paths', () => {
    expect(shalomPublicInternalPath('/properties/../admin')).toBeNull();
    expect(shalomPublicInternalPath('/properties//x')).toBeNull();
    expect(shalomPublicInternalPath('/book/bad slug')).toBeNull();
    expect(shalomPublicInternalPath('/confirmation/not-a-uuid')).toBeNull();
    expect(shalomPublicInternalPath('/executive/shalom')).toBeNull();
    expect(isShalomPublicInternalPath('/login/md')).toBe(false);
  });
});
