import {
  LayoutDashboard,
  MapPinned,
  Mic,
  Phone,
  ShieldCheck,
} from 'lucide-react';

import ClientLoginForm from './ClientLoginForm';
import SecurityClientPortalPreview from '../security-website/components/SecurityClientPortalPreview';

const PORTAL_FEATURES = [
  {
    icon: MapPinned,
    title: 'GPS-verified attendance',
    description: 'See who is on site right now — every check-in stamped to your geofence.',
  },
  {
    icon: Phone,
    title: 'Emergency call button',
    description: 'One-tap connection to the duty manager hotline from your portal.',
  },
  {
    icon: Mic,
    title: 'Incident tracking',
    description: 'Field reports with voice notes — status and response visible to you.',
  },
  {
    icon: ShieldCheck,
    title: 'SM supervisor proof',
    description: 'Verified supervisor visits with GPS and live selfie audit trails.',
  },
];

export default function ClientLoginPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-20">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
        <div className="order-2 lg:order-1">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">
            Client transparency
          </p>
          <h1 className="mt-2 text-3xl font-semibold uppercase tracking-tight text-slate-900">
            Your site command dashboard
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Classic Venture clients get live proof — GPS-verified guard attendance, supervisor visit
            logs, patrol compliance, and incident status. No more waiting for monthly email reports.
          </p>

          <div className="mt-8 space-y-4">
            {PORTAL_FEATURES.map((feature) => (
              <div key={feature.title} className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">
                    {feature.title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="order-1 space-y-8 lg:order-2">
          <div className="lg:hidden">
            <SecurityClientPortalPreview />
          </div>
          <ClientLoginForm />
          <div className="hidden lg:block">
            <p className="mb-4 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
              Preview — live client view
            </p>
            <SecurityClientPortalPreview />
          </div>
        </div>
      </div>
    </div>
  );
}
