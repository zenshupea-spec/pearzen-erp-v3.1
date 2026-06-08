'use client';

import { CafeFrontSessionGate } from '../../../components/cafe-front/CafeFrontSessionGate';
import { MenuRequestPanel } from '../../../components/cafe-front/MenuRequestPanel';

export default function CafeFrontMenuPage() {
  return (
    <CafeFrontSessionGate subtitle="Menu requests · change item or add item until MD approves">
      {() => <MenuRequestPanel />}
    </CafeFrontSessionGate>
  );
}
