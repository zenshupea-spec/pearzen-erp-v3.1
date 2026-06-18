import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';

import { getSecurityWebsitePageData } from '../actions';

export const metadata = {
  title: 'Contact | Pearzen Security',
  description: '24/7 operations hotline, email, and office contact for Pearzen Security Services.',
};

export default async function ContactPage() {
  const { content } = await getSecurityWebsitePageData();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Contact us</h1>
      <p className="mt-4 max-w-2xl text-base text-slate-600">{content.ctaBody}</p>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
            Direct line
          </h2>
          <p className="text-sm text-slate-600">
            Quotes, proposals, and client enquiries — handled personally.
          </p>
          <a
            href={`tel:${content.contactPhone.replace(/\s/g, '')}`}
            className="flex items-center gap-3 text-slate-800 hover:text-slate-950"
          >
            <Phone className="h-5 w-5 text-amber-600" />
            {content.contactPhone}
          </a>
          <a
            href={`mailto:${content.contactEmail}`}
            className="flex items-center gap-3 text-slate-800 hover:text-slate-950"
          >
            <Mail className="h-5 w-5 text-amber-600" />
            {content.contactEmail}
          </a>
          <p className="flex items-center gap-3 text-slate-800">
            <MapPin className="h-5 w-5 text-amber-600" />
            {content.contactAddress}
          </p>
        </div>

        <div className="space-y-6 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-rose-900">
            Emergency hotline
          </h2>
          <a
            href={`tel:${content.contactEmergencyPhone.replace(/\s/g, '')}`}
            className="flex items-center gap-3 text-lg font-semibold text-rose-950"
          >
            <Phone className="h-5 w-5" />
            {content.contactEmergencyPhone}
          </a>
          <p className="text-sm text-rose-800">
            For active incidents requiring immediate escalation — not for sales enquiries.
          </p>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/security-website/pricing"
          className="rounded-full bg-slate-900 px-6 py-3 text-sm font-bold text-white"
        >
          Request site assessment
        </Link>
        <a
          href={`https://wa.me/${content.whatsappNumber.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-800"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
