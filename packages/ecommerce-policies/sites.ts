import type { EcommercePolicySite } from './types';

export const CAFE_TASHA_POLICY_SITE: EcommercePolicySite = {
  businessName: 'Café Tasha',
  websiteUrl: 'https://tasha.lk',
  contactEmail: 'orders@tasha.lk',
  minimumAge: 18,
  returnWindowDays: 7,
  refundProcessingDays: 5,
  additionalNonReturnableItems: [
    'Prepared food and beverages once preparation has started',
    'Items consumed on premises (dine-in orders)',
  ],
  businessDescription:
    'an online café menu where you can order for dine-in, takeout, or delivery',
};

export const SHALOM_RESIDENCE_POLICY_SITE: EcommercePolicySite = {
  businessName: 'Shalom Residence',
  websiteUrl: 'https://shalom.pearzen.tech',
  contactEmail: 'bookings@shalom.pearzen.tech',
  minimumAge: 18,
  returnWindowDays: 14,
  refundProcessingDays: 7,
  additionalNonReturnableItems: [
    'Completed or partially used accommodation stays',
    'No-show bookings',
  ],
  businessDescription:
    'short-term accommodation and residence bookings managed by Shalom Residence',
};
