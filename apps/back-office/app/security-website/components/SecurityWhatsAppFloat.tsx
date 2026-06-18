'use client';

import { MessageCircle } from 'lucide-react';

import { useSecurityWebsite } from './SecurityWebsiteContext';

type Props = {
  message?: string;
};

export default function SecurityWhatsAppFloat({ message }: Props) {
  const { content, ui } = useSecurityWebsite();
  const digits = content.whatsappNumber.replace(/\D/g, '');
  if (!digits) return null;

  const defaultMessage =
    message ??
    `Hello ${content.companyName}, I would like to request a site security assessment.`;
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(defaultMessage)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-[#1fb855] hover:shadow-xl max-md:bottom-4 max-md:right-4"
      aria-label={ui.whatsappUs}
    >
      <MessageCircle className="h-5 w-5" />
      <span className="hidden sm:inline">{ui.whatsappUs}</span>
    </a>
  );
}

export function buildWhatsAppQuoteRequestMessage(
  companyName: string,
  serviceLabel: string,
  guards: number,
  locationLabel: string,
  customRequest?: string,
  district?: string,
): string {
  const parts = [
    `Hello ${companyName},`,
    'I would like to request a custom security quote.',
    `Service: ${serviceLabel}, ${guards} guard(s) per shift.`,
    `Location: ${locationLabel}.`,
  ];
  if (district) parts.push(`District: ${district}.`);
  if (customRequest?.trim()) parts.push(`Requirements: ${customRequest.trim()}.`);
  parts.push('Please contact me for a site assessment.');
  return parts.join(' ');
}

export function buildWhatsAppEstimateMessage(
  companyName: string,
  estimateRange: string,
  serviceLabel: string,
  guards: number,
  district?: string,
): string {
  const parts = [
    `Hello ${companyName},`,
    `I used your cost estimator: ${estimateRange}/month.`,
    `Service: ${serviceLabel}, ${guards} guard(s) per shift.`,
  ];
  if (district) parts.push(`District: ${district}.`);
  parts.push('Please contact me for a site assessment.');
  return parts.join(' ');
}
