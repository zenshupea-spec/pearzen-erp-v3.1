import { Suspense } from 'react';

import ForgeAwaitSessionClient from './ForgeAwaitSessionClient';

export default function ForgeAwaitSessionPage() {
  return (
    <Suspense fallback={null}>
      <ForgeAwaitSessionClient />
    </Suspense>
  );
}
