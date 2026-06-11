import GuardAttendanceClient from './GuardAttendanceClient';
import { loadGuardAttendancePageData } from '../../../../lib/load-guard-attendance-page';
import { getGuardAttendanceShiftSettings } from './actions';

export const dynamic = 'force-dynamic';

export default async function GuardAttendancePage() {
  const [{ sites, guards, existing, defaultDate }, { startTimes }] = await Promise.all([
    loadGuardAttendancePageData(),
    getGuardAttendanceShiftSettings(),
  ]);

  return (
    <GuardAttendanceClient
      sites={sites}
      guards={guards}
      existing={existing}
      defaultDate={defaultDate}
      shiftTiming={startTimes}
    />
  );
}
