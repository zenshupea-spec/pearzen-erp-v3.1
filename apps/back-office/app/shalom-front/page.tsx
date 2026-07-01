'use client';

import { ShalomFrontSessionGate } from '../../components/shalom-front/ShalomFrontSessionGate';
import ShalomFrontCalendar from '../../components/shalom-front/ShalomFrontCalendar';
import { ExecutivePageLiveSubtitle } from '../../components/executive/ExecutivePageChrome';

export default function ShalomFrontHomePage() {
  return (
    <ShalomFrontSessionGate>
      {() => (
        <div className="space-y-4">
          <ExecutivePageLiveSubtitle>
            Assigned properties · month view
          </ExecutivePageLiveSubtitle>
          <ShalomFrontCalendar />
        </div>
      )}
    </ShalomFrontSessionGate>
  );
}
