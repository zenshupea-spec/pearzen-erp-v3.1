import Link from 'next/link';
import { PackagePlus } from 'lucide-react';
import UniformIssuePage from '../../../../components/uniform-issue/UniformIssuePage';

export const dynamic = 'force-dynamic';

export default function HqUniformIssuePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/hq/deductions/issue-vo-stock"
          className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-violet-800 shadow-sm transition-colors hover:bg-violet-100"
        >
          <PackagePlus className="h-4 w-4 shrink-0" />
          Issue stock to OM / TM / SM
        </Link>
      </div>
      <UniformIssuePage
        portal="HQ"
        backHref="/hq/deductions"
        backLabel="Back to deductions"
        portalTitle="Deductions Admin"
      />
    </div>
  );
}
