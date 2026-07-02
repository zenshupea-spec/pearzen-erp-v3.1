import { Info } from 'lucide-react';

/**
 * Shared HR copy: who resets portal passwords vs who uses self-service / executive paths.
 */
export default function HrPortalPasswordResetNotice({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 ${className}`}
    >
      <p className="flex items-start gap-2 font-semibold text-slate-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <span>Who resets portal access?</span>
      </p>
      <ul className="mt-2 list-inside list-disc space-y-1 pl-6 text-[13px]">
        <li>
          <strong>MD, OD, and HR</strong> use their own portals for password reset — not this HR
          desk. MD/OD: Executive → Security &amp; Access. HR: contact OD or MD.
        </li>
        <li>
          <strong>All other staff</strong> (HQ, SM, Café, Shalom front office, etc.) contact HR for
          a one-time password when they forget their PIN or need first-time access. Re-provisioning
          OTP clears password/PIN history; staff must choose a new credential on next sign-in.
        </li>
        <li>
          <strong>Require password change</strong> (HQ staff with an active portal password) clears
          stored history and blocks portal routes until they set a new password at sign-in.
        </li>
        <li>
          <strong>Guards</strong> sign in with EPF only on the field check-in app — no HR password
          reset.
        </li>
      </ul>
    </div>
  );
}
