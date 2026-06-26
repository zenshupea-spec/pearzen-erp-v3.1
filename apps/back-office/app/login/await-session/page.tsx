import { Suspense } from 'react';

import AwaitSessionClient from './AwaitSessionClient';

export default function AwaitSessionPage() {
  return (
    <Suspense fallback={null}>
      <AwaitSessionClient />
    </Suspense>
  );
}
