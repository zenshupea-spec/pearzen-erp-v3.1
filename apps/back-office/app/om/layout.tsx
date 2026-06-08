import type { ReactNode } from 'react';

import { OmFieldDataProvider } from './context/OmFieldDataContext';

export default function OmLayout({ children }: { children: ReactNode }) {
  return <OmFieldDataProvider>{children}</OmFieldDataProvider>;
}
