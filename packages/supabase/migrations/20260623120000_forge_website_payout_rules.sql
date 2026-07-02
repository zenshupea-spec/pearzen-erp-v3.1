-- Align website manager revenue-share defaults with Pearzen business model:
-- Month 1: LKR 10,000 client charge → LKR 5,000 Pearzen + LKR 5,000 manager
-- Month 2+: LKR 5,000 client charge → LKR 4,000 Pearzen + LKR 1,000 manager

UPDATE public.forge_payout_rules
SET
  month_one_partner_lkr = 5000,
  month_one_pearzen_lkr = 5000,
  month_two_plus_partner_lkr = 1000,
  month_two_plus_pearzen_lkr = 4000,
  updated_at = now()
WHERE singleton = true;
