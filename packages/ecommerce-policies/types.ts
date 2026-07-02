export type PolicyKind = 'refund' | 'privacy' | 'terms';

export type PolicySection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type EcommercePolicySite = {
  businessName: string;
  websiteUrl: string;
  contactEmail: string;
  /** Minimum age to use the site / make purchases */
  minimumAge: number;
  /** Days customers may request a return (non-perishable goods) */
  returnWindowDays: number;
  /** Business days to process refunds after approval */
  refundProcessingDays: number;
  /** Extra non-returnable items beyond the standard list */
  additionalNonReturnableItems?: string[];
  /** Short description of what the business sells (for intro copy) */
  businessDescription: string;
};
