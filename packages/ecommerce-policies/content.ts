import type { EcommercePolicySite, PolicyKind, PolicySection } from './types';

const STANDARD_NON_RETURNABLE = [
  'Gift cards',
  'Downloadable software products',
  'Personalized or custom-made items',
  'Perishable goods',
];

function nonReturnableItems(site: EcommercePolicySite): string[] {
  return [...STANDARD_NON_RETURNABLE, ...(site.additionalNonReturnableItems ?? [])];
}

export function policyTitle(kind: PolicyKind): string {
  if (kind === 'refund') return 'Refund Policy';
  if (kind === 'privacy') return 'Privacy Policy';
  return 'Terms and Conditions';
}

export function buildPolicySections(
  site: EcommercePolicySite,
  kind: PolicyKind,
): PolicySection[] {
  if (kind === 'refund') return refundSections(site);
  if (kind === 'privacy') return privacySections(site);
  return termsSections(site);
}

function refundSections(site: EcommercePolicySite): PolicySection[] {
  const days = site.returnWindowDays;
  const processing = site.refundProcessingDays;

  return [
    {
      title: 'Introduction',
      paragraphs: [
        `Thank you for choosing ${site.businessName}. We value your satisfaction and strive to provide you with the best online experience possible. If, for any reason, you are not completely satisfied with your purchase, we are here to help.`,
      ],
    },
    {
      title: 'Returns',
      paragraphs: [
        `Where applicable, we accept returns within ${days} days from the date of purchase. To be eligible for a return, your item must be unused and in the same condition that you received it, and in the original packaging where packaging applies.`,
        'Prepared food, beverages, and other perishable items cannot be returned once preparation or service has begun.',
      ],
    },
    {
      title: 'Refunds',
      paragraphs: [
        'Once we receive your return (where applicable) and inspect the item, we will notify you of the status of your refund. If your return is approved, we will initiate a refund to your original method of payment.',
        'Please note that the refund amount will exclude any delivery or service charges incurred during the initial purchase, unless the return is due to our error.',
        'For card payments processed through our secure payment partner, refunds are issued to the same card used at checkout.',
      ],
    },
    {
      title: 'Exchanges',
      paragraphs: [
        `If you would like to exchange an eligible item, please contact us within ${days} days of receiving your order. We will provide further instructions on how to proceed.`,
      ],
    },
    {
      title: 'Non-Returnable Items',
      paragraphs: ['Certain items are non-returnable and non-refundable. These include:'],
      bullets: nonReturnableItems(site),
    },
    {
      title: 'Damaged or Defective Items',
      paragraphs: [
        'If your order arrives damaged, defective, or incorrect, please contact us immediately. We will arrange for a replacement or issue a refund, depending on your preference and availability.',
      ],
    },
    {
      title: 'Order Cancellations',
      paragraphs: [
        'You may cancel an order before preparation or fulfilment begins. If payment was already collected, a full refund will be issued to your original payment method.',
      ],
    },
    {
      title: 'Return Shipping',
      paragraphs: [
        'You are responsible for return shipping costs unless the return is due to our error (for example, wrong item shipped or defective product). In such cases, we will arrange collection or reimbursement as appropriate.',
      ],
    },
    {
      title: 'Processing Time',
      paragraphs: [
        `Refunds and exchanges will be processed within ${processing} business days after we receive and approve your return, where a return is required. It may take additional time for the refund to appear in your account, depending on your bank or payment provider.`,
      ],
    },
    {
      title: 'Contact Us',
      paragraphs: [
        `If you have any questions about this Refund Policy, please contact us at ${site.contactEmail}.`,
      ],
    },
  ];
}

function privacySections(site: EcommercePolicySite): PolicySection[] {
  return [
    {
      title: 'Introduction',
      paragraphs: [
        `At ${site.businessName}, we are committed to protecting the privacy and security of our customers' personal information. This Privacy Policy outlines how we collect, use, and safeguard your information when you visit or make a purchase on ${site.websiteUrl.replace(/^https?:\/\//, '')}. By using our website, you consent to the practices described in this policy.`,
      ],
    },
    {
      title: 'Information We Collect',
      paragraphs: ['When you visit our website, we may collect certain information about you, including:'],
      bullets: [
        'Personal identification information (such as your name, email address, and phone number) provided voluntarily during registration or checkout.',
        'Payment and billing information necessary to process your orders. Card details are securely handled by trusted third-party payment processors such as PayHere; we do not store your full card number.',
        'Browsing information, such as your IP address, browser type, and device information, collected automatically using cookies and similar technologies.',
        'Order and booking details, including items selected, delivery address, and fulfilment preferences.',
      ],
    },
    {
      title: 'Use of Information',
      paragraphs: ['We may use the collected information for the following purposes:'],
      bullets: [
        'To process and fulfil your orders, including preparation, delivery, and customer notifications.',
        'To communicate with you regarding your purchases, provide customer support, and respond to inquiries.',
        'To personalize your experience and present relevant offers where applicable.',
        'To improve our website, products, and services based on feedback and usage patterns.',
        'To detect and prevent fraud, unauthorized activities, and abuse of our website.',
      ],
    },
    {
      title: 'Information Sharing',
      paragraphs: [
        'We respect your privacy and do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except in the following circumstances:',
      ],
      bullets: [
        'Trusted service providers who assist us in operating our website, processing payments, and delivering services. These providers are contractually obligated to handle your data securely and confidentially.',
        'Legal requirements: we may disclose your information if required by law or in response to valid legal requests.',
      ],
    },
    {
      title: 'Data Security',
      paragraphs: [
        'We implement industry-standard security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet or electronic storage is completely secure, and we cannot guarantee absolute security.',
      ],
    },
    {
      title: 'Cookies and Tracking Technologies',
      paragraphs: [
        'We use cookies and similar technologies to enhance your browsing experience, analyze website traffic, and gather information about your preferences. You may disable cookies through your browser settings, but this may limit certain features of our website.',
      ],
    },
    {
      title: 'Changes to This Privacy Policy',
      paragraphs: [
        'We reserve the right to update or modify this Privacy Policy at any time. Changes will be posted on this page with a revised last updated date. We encourage you to review this policy periodically.',
      ],
    },
    {
      title: 'Contact Us',
      paragraphs: [
        `If you have any questions, concerns, or requests regarding this Privacy Policy or the handling of your personal information, please contact us at ${site.contactEmail}.`,
      ],
    },
  ];
}

function termsSections(site: EcommercePolicySite): PolicySection[] {
  const host = site.websiteUrl.replace(/^https?:\/\//, '');

  return [
    {
      title: 'Introduction',
      paragraphs: [
        `Welcome to ${site.businessName}. These Terms and Conditions govern your use of ${host} and the purchase of products or services from our platform. By accessing and using our website, you agree to comply with these terms. Please read them carefully before proceeding with any transactions.`,
        `Our website offers ${site.businessDescription}.`,
      ],
    },
    {
      title: 'Use of the Website',
      bullets: [
        `You must be at least ${site.minimumAge} years old to use our website or make purchases.`,
        'You are responsible for maintaining the confidentiality of your account information, including any login credentials.',
        'You agree to provide accurate and current information during registration and checkout.',
        'You may not use our website for any unlawful or unauthorized purposes.',
      ],
    },
    {
      title: 'Product Information and Pricing',
      bullets: [
        'We strive to provide accurate product descriptions, images, and pricing information. However, we do not guarantee the accuracy or completeness of such information.',
        'Prices are subject to change without notice. Promotions or discounts are valid for a limited time and may be subject to additional terms.',
      ],
    },
    {
      title: 'Orders and Payments',
      bullets: [
        'By placing an order on our website, you are making an offer to purchase the selected products or services.',
        'We reserve the right to refuse or cancel any order for any reason, including product availability, errors in pricing or product information, or suspected fraudulent activity.',
        'You agree to provide valid and up-to-date payment information and authorize us to charge the total order amount, including applicable taxes and delivery fees, to your chosen payment method.',
        'Card payments are processed securely by trusted third-party payment processors. We do not store or have access to your full payment card details.',
      ],
    },
    {
      title: 'Shipping and Delivery',
      bullets: [
        'We will make reasonable efforts to ensure timely fulfilment, preparation, or delivery of your orders.',
        'Delivery and service times provided are estimates and may vary based on your location, demand, and other operational factors.',
      ],
    },
    {
      title: 'Returns and Refunds',
      paragraphs: [
        'Our Refund Policy governs the process and conditions for returning products and seeking refunds. Please refer to the Refund Policy published on our website for more information.',
      ],
    },
    {
      title: 'Intellectual Property',
      bullets: [
        `All content and materials on our website, including text, images, logos, and graphics, are protected by intellectual property rights and are the property of ${site.businessName} or its licensors.`,
        'You may not use, reproduce, distribute, or modify any content from our website without our prior written consent.',
      ],
    },
    {
      title: 'Limitation of Liability',
      bullets: [
        `In no event shall ${site.businessName}, its directors, employees, or affiliates be liable for any direct, indirect, incidental, special, or consequential damages arising out of or in connection with your use of our website or the purchase and use of our products or services.`,
        'We make no warranties or representations, express or implied, regarding the quality, accuracy, or suitability of the products or services offered on our website, except as required by applicable law.',
      ],
    },
    {
      title: 'Amendments and Termination',
      paragraphs: [
        'We reserve the right to modify, update, or terminate these Terms and Conditions at any time without prior notice. It is your responsibility to review these terms periodically for any changes.',
      ],
    },
    {
      title: 'Contact Us',
      paragraphs: [
        `If you have any questions about these Terms and Conditions, please contact us at ${site.contactEmail}.`,
      ],
    },
  ];
}
