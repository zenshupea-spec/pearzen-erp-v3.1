'use client';

import ShalomConfirmationResendButton from './ShalomConfirmationResendButton';
import { shalomPublicButtonGhostClass } from '../../lib/shalom-public-tokens';

export default function ShalomConfirmationToolbar({
  bookingId,
  calendarUrl,
  emailConfigured,
}: {
  bookingId: string;
  calendarUrl: string | null;
  emailConfigured: boolean;
}) {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start print:hidden">
      {calendarUrl ? (
        <a
          href={calendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={shalomPublicButtonGhostClass}
        >
          Add to calendar
        </a>
      ) : null}
      <button type="button" onClick={() => window.print()} className={shalomPublicButtonGhostClass}>
        Print confirmation
      </button>
      <ShalomConfirmationResendButton
        bookingId={bookingId}
        emailConfigured={emailConfigured}
      />
    </div>
  );
}
