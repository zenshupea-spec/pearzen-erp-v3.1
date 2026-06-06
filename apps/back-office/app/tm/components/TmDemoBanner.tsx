import { Sparkles } from 'lucide-react';
import { TM_DEMO_NOTE } from '../lib/demo-data';

export default function TmDemoBanner() {
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-xl border border-violet-200/80 bg-violet-50 px-4 py-3 text-sm text-violet-950"
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
      <p className="font-medium">{TM_DEMO_NOTE}</p>
    </div>
  );
}
