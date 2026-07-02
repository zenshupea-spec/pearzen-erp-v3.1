import { describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import { CVS_COMPANY_ID } from './company-ids';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from './company-context';

function mockSupabase(input: {
  user?: { email?: string; app_metadata?: Record<string, unknown> } | null;
  tenantCompanyId?: string | null;
}): SupabaseClient {
  const tenantLookup = vi.fn().mockResolvedValue(
    input.tenantCompanyId
      ? { id: input.tenantCompanyId, slug: 'cvs', name: 'CVS' }
      : null,
  );

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: input.user ?? null } }),
    },
    from: vi.fn((table: string) => {
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: tenantLookup,
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
          ilike: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      };
    }),
  } as unknown as SupabaseClient;
}

vi.mock('./tenant-context', () => ({
  resolveTenantCompany: vi.fn(async (slug: string) => {
    if (slug === 'cvs') {
      return { id: CVS_COMPANY_ID, slug: 'cvs', name: 'CVS' };
    }
    if (slug === 'demo') {
      return { id: '11111111-1111-1111-1111-111111111111', slug: 'demo', name: 'Demo' };
    }
    return null;
  }),
}));

describe('resolveCompanyIdForSession', () => {
  it('returns null for anonymous requests without tenant slug', async () => {
    const supabase = mockSupabase({ user: null });
    await expect(resolveCompanyIdForSession(supabase, null)).resolves.toBeNull();
  });

  it('does not hardcode CVS when unauthenticated and slug is absent', async () => {
    const supabase = mockSupabase({ user: null });
    const result = await resolveCompanyIdForSession(supabase);
    expect(result).toBeNull();
  });

  it('resolves company from explicit tenant slug without membership', async () => {
    const supabase = mockSupabase({ user: null });
    await expect(resolveCompanyIdForSession(supabase, 'cvs')).resolves.toBe(CVS_COMPANY_ID);
    await expect(resolveCompanyIdForSession(supabase, 'demo')).resolves.toBe(
      '11111111-1111-1111-1111-111111111111',
    );
  });

  it('returns null when signed-in user membership conflicts with slug tenant', async () => {
    const supabase = mockSupabase({
      user: { email: 'md@tenant.test', app_metadata: { company_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } },
    });
    await expect(resolveCompanyIdForSession(supabase, 'demo')).resolves.toBeNull();
  });

  it('returns membership company when slug is absent', async () => {
    const companyId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const supabase = mockSupabase({
      user: { email: 'md@tenant.test', app_metadata: { company_id: companyId } },
    });
    await expect(resolveCompanyIdForSession(supabase, null)).resolves.toBe(companyId);
  });
});

describe('rosterCompanyId', () => {
  it('returns null without session company', () => {
    expect(rosterCompanyId(null)).toBeNull();
  });

  it('does not fall back to CVS', () => {
    expect(rosterCompanyId(null)).not.toBe(CVS_COMPANY_ID);
  });

  it('returns session company when set', () => {
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    expect(rosterCompanyId(id)).toBe(id);
  });

  it('returns null for HQ master placeholder', () => {
    expect(rosterCompanyId('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('fetchWithRosterCompanyFallback', () => {
  it('does not fetch CVS when session company is absent', async () => {
    const fetcher = vi.fn(async (companyId: string | null) => {
      if (companyId === CVS_COMPANY_ID) return [{ id: 'cvs-row' }];
      if (companyId === null) return [{ id: 'unscoped' }];
      return [];
    });

    const rows = await fetchWithRosterCompanyFallback(fetcher, null);
    expect(rows).toEqual([{ id: 'unscoped' }]);
    expect(fetcher).not.toHaveBeenCalledWith(CVS_COMPANY_ID);
  });

  it('prefers session company before unscoped fetch', async () => {
    const tenantId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const fetcher = vi.fn(async (companyId: string | null) => {
      if (companyId === tenantId) return [{ id: 'tenant' }];
      if (companyId === null) return [{ id: 'unscoped' }];
      return [];
    });

    const rows = await fetchWithRosterCompanyFallback(fetcher, tenantId);
    expect(rows).toEqual([{ id: 'tenant' }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
