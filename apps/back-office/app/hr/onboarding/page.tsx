import Link from 'next/link';

import {
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import { getEmployeePiiEncryptionError } from '../../../lib/employee-pii';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { getOccupiedSingletonPortalRanks } from '../../../lib/singleton-portal-rank-guard';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { getRankPayMatrix } from '../../executive/settings/rank-matrix-actions';
import { getInternalWorkLocationsForMnr } from '../../executive/settings/internal-work-locations-actions';
import { getHrSectorNames } from '../hr-sector-actions';
import { getOnboardingGuardSites, onboardEmployee } from '../onboarding-actions';
import HrHubPills from '../HrHubPills';
import InductionForm from '../InductionForm';
import { UserPlus, FileSignature, Home } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HROnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ temp?: string; name?: string }>;
}) {
  const { temp: tempEmpId, name: tempNameHint } = await searchParams;
  const mergeContext = tempEmpId?.trim()
    ? { tempId: tempEmpId.trim(), nameHint: tempNameHint?.trim() }
    : undefined;
  const rankMatrix = await getRankPayMatrix();
  const sectorNames = await getHrSectorNames();
  const internalWorkLocations = await getInternalWorkLocationsForMnr();
  const guardSites = await getOnboardingGuardSites();
  const db = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(db);
  const occupiedSingletonRanks = companyId
    ? await getOccupiedSingletonPortalRanks(companyId)
    : [];
  const {
    data: { user },
  } = await db.auth.getUser();
  const editorProfile = user
    ? await fetchBackOfficeUserProfile(db, user)
    : { role: null, full_name: null };
  const piiEncryptionError = getEmployeePiiEncryptionError();

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-6">

      <header className="pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 shadow-sm">
              <FileSignature className="w-7 h-7 text-rose-600" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-slate-900">
                Onboarding Portal
              </h1>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
                Personnel Induction &bull; ISO Vetting &bull; Workforce Compliance
              </p>
            </div>
          </div>
          <Link href="/hr" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all shadow-sm hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)]/60 hover:text-[color:var(--cvs-accent)]">
            <Home className="w-3.5 h-3.5" /> HR Desk
          </Link>
        </div>

        <HrHubPills />
      </header>

      {mergeContext && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <p className="text-sm font-bold text-indigo-900 uppercase tracking-wide">
            Shadow roster merge — {mergeContext.tempId}
          </p>
          <p className="mt-1 text-sm font-semibold text-indigo-700">
            Complete induction to create the permanent profile. Shift history from this temp ID will
            transfer to Master Nominal Roll on submit.
          </p>
        </div>
      )}

      {piiEncryptionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-900">
          Onboarding is blocked until PII encryption is configured: {piiEncryptionError}
        </div>
      ) : null}

      <div className="grid grid-cols-12 gap-6 items-start">
        <section className="col-span-12 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-gradient-to-r from-white to-rose-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-50 border border-rose-200">
                <UserPlus className="w-4 h-4 text-rose-600" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-rose-700">
                  New Employee Induction
                </h2>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">All fields marked * are mandatory</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-xs font-black text-rose-700 uppercase tracking-widest">Live</span>
            </div>
          </div>
          <InductionForm
            action={onboardEmployee}
            rankMatrix={rankMatrix}
            guardSites={guardSites}
            internalWorkLocations={internalWorkLocations}
            sectorNames={sectorNames}
            occupiedSingletonRanks={occupiedSingletonRanks}
            editorRole={editorProfile.role}
            mergeContext={mergeContext}
            disabled={Boolean(piiEncryptionError)}
          />
        </section>
      </div>
    </div>
  );
}
