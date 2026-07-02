'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getPartnerForUserId } from '../../lib/partner-portal-auth';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';

export type PartnerDashboardSnapshot = {
  partnerName: string;
  referralCode: string;
  portfolioCount: number;
  activePortfolioCount: number;
  payoutBalanceLkr: number;
};

export async function fetchPartnerDashboard(): Promise<
  | { success: true; data: PartnerDashboardSnapshot }
  | { success: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error('Not signed in');

    const partner = await getPartnerForUserId(user.id);
    if (!partner) throw new Error('Partner profile not found');

    const [{ count: portfolioCount }, { count: activePortfolioCount }, { data: payouts }] =
      await Promise.all([
        supabase
          .from('forge_partner_portfolios')
          .select('id', { count: 'exact', head: true })
          .eq('partner_id', partner.id),
        supabase
          .from('forge_partner_portfolios')
          .select('id', { count: 'exact', head: true })
          .eq('partner_id', partner.id)
          .eq('status', 'active'),
        supabase
          .from('forge_payout_ledger')
          .select('partner_share_lkr')
          .eq('partner_id', partner.id),
      ]);

    const payoutBalanceLkr = (payouts ?? []).reduce(
      (sum, row) => sum + Number(row.partner_share_lkr ?? 0),
      0,
    );

    return {
      success: true,
      data: {
        partnerName: partner.displayName,
        referralCode: partner.referralCode,
        portfolioCount: portfolioCount ?? 0,
        activePortfolioCount: activePortfolioCount ?? 0,
        payoutBalanceLkr,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load dashboard';
    return { success: false, error: message };
  }
}

export async function signOutPartner() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath('/partners');
  redirect('/login/partners');
}
