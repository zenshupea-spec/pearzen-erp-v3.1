/** Match pearzen.tech contact inquiries to Forge commerce product codes. */

import { formatLkr } from './saas-billing';

export type ForgeInquiryProductCode =
  | 'wfm_tool'
  | 'custom_software'
  | 'website_build'
  | 'vertical_salon'
  | 'vertical_restaurant'
  | 'vertical_retail';

export type LinkableInboxThread = {
  id: string;
  subject: string;
  visitorEmail: string;
  suggestedProductCode: ForgeInquiryProductCode | null;
  lastMessageAt: string;
};

const INQUIRY_RULES: { code: ForgeInquiryProductCode; patterns: RegExp[] }[] = [
  {
    code: 'wfm_tool',
    patterns: [
      /wfm\s+tool/i,
      /workforce\s+(&|and)?\s*hospitality/i,
      /hospitality\s+tool/i,
    ],
  },
  {
    code: 'custom_software',
    patterns: [/custom\s+(internal\s+)?software/i, /bespoke\s+(erp|portal|software)/i],
  },
  {
    code: 'website_build',
    patterns: [
      /website\s+building/i,
      /website\s+build/i,
      /web\s*site/i,
      /landing\s+page/i,
      /customer\s+menu/i,
      /marketing\s+site/i,
    ],
  },
  {
    code: 'vertical_salon',
    patterns: [/salon\s+(vertical|addon|add-on|module)/i],
  },
  {
    code: 'vertical_restaurant',
    patterns: [/restaurant|cafe|catering|f\s*&\s*b|hospitality\s+vertical/i],
  },
  {
    code: 'vertical_retail',
    patterns: [/retail|e-?commerce|inventory\s+vertical/i],
  },
];

export function inferProductCodeFromInquiry(
  subject: string,
  body?: string | null,
): ForgeInquiryProductCode | null {
  const text = `${subject}\n${body ?? ''}`.trim();
  if (!text) return null;

  for (const rule of INQUIRY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.code;
    }
  }
  return null;
}

export function inquiryProductLabel(code: ForgeInquiryProductCode | null): string | null {
  if (!code) return null;
  switch (code) {
    case 'wfm_tool':
      return 'WFM tool';
    case 'custom_software':
      return 'Custom software';
    case 'website_build':
      return 'Website build';
    case 'vertical_salon':
      return 'Salon vertical';
    case 'vertical_restaurant':
      return 'Restaurant / café';
    case 'vertical_retail':
      return 'Retail vertical';
    default:
      return code;
  }
}

export function buildInvoiceThreadReply(input: {
  productName: string;
  amountLkr: number;
  dueDate: string;
  emailed: boolean;
}): string {
  const amount = formatLkr(input.amountLkr);
  const lines = [
    `Thanks for your inquiry about ${input.productName}.`,
    '',
    `Invoice amount: ${amount}`,
    `Due date: ${input.dueDate}`,
  ];

  if (input.emailed) {
    lines.push('', 'We have also emailed this invoice to you separately.');
  } else {
    lines.push('', 'We will follow up with payment details shortly.');
  }

  lines.push('', '— Pearzen Technologies');
  return lines.join('\n');
}

export function defaultBuyerNameFromThread(input: {
  visitorName: string | null;
  visitorEmail: string;
}): string {
  if (input.visitorName?.trim()) return input.visitorName.trim();
  const local = input.visitorEmail.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!local) return input.visitorEmail;
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveSuggestedProductCode(input: {
  subject: string;
  body?: string | null;
  storedCode?: string | null;
}): ForgeInquiryProductCode | null {
  if (input.storedCode) {
    return input.storedCode as ForgeInquiryProductCode;
  }
  return inferProductCodeFromInquiry(input.subject, input.body);
}
