'use client';

import { useState, useTransition } from 'react';

import { resendShalomGuestConfirmationEmailAction } from '../../app/shalom-public/confirmation/shalom-confirmation-actions';
import { shalomPublicButtonGhostClass } from '../../lib/shalom-public-tokens';

export default function ShalomConfirmationResendButton({
  bookingId,
  emailConfigured,
}: {
  bookingId: string;
  emailConfigured: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleResend() {
    setMessage(null);
    startTransition(async () => {
      const result = await resendShalomGuestConfirmationEmailAction(bookingId);
      setMessage(result.message);
    });
  }

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={handleResend}
        disabled={isPending}
        className={`${shalomPublicButtonGhostClass} w-full sm:w-auto disabled:opacity-60`}
      >
        {isPending ? 'Sending…' : 'Resend confirmation email'}
      </button>
      {message ? (
        <p className="mt-2 text-xs leading-relaxed text-[color:var(--shalom-muted)]">{message}</p>
      ) : !emailConfigured ? (
        <p className="mt-2 text-xs leading-relaxed text-[color:var(--shalom-muted)]">
          Email delivery is disabled in this environment. Your booking remains confirmed.
        </p>
      ) : null}
    </div>
  );
}
