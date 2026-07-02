/** Public URL paths required by PayHere merchant activation. */
export const ECOMMERCE_POLICY_PATHS = {
  refund: '/refund-policy',
  privacy: '/privacy-policy',
  terms: '/terms-and-conditions',
} as const;

export function ecommercePolicyUrl(
  siteUrl: string,
  kind: keyof typeof ECOMMERCE_POLICY_PATHS,
): string {
  const base = siteUrl.replace(/\/$/, '');
  return `${base}${ECOMMERCE_POLICY_PATHS[kind]}`;
}
