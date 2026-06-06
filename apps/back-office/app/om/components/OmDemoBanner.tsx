import { Sparkles } from 'lucide-react';
import { OM_DEMO_NOTE } from '../lib/demo-data';

export default function OmDemoBanner() {
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="font-medium">{OM_DEMO_NOTE}</p>
    </div>
  );
}
