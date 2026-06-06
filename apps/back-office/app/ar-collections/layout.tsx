import type { ReactNode } from 'react';
import { ExecutiveVaultShell } from '../../components/executive/ExecutiveVaultShell';

export default function ArCollectionsLayout({ children }: { children: ReactNode }) {
  return <ExecutiveVaultShell>{children}</ExecutiveVaultShell>;
}
