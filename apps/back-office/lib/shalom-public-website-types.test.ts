import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT,
  mergeShalomPublicWebsiteContent,
} from './shalom-public-website-types';

describe('shalom-public-website-types', () => {
  it('merges partial content with defaults', () => {
    const merged = mergeShalomPublicWebsiteContent({
      heroDescription: 'Custom hero copy.',
      contactPhone: '+94770000000',
    });

    expect(merged.heroDescription).toBe('Custom hero copy.');
    expect(merged.contactPhone).toBe('+94770000000');
    expect(merged.brandName).toBe(DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.brandName);
  });
});
