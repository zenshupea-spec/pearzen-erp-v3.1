import Link from 'next/link';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  findRankPayEntry,
  isRankValidForCorporateGroup,
} from '../../../../../packages/rank-pay-matrix';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../../lib/company-context';
import {
  assertCanAssignRank,
  canManageExecutiveAccess,
} from '../../../lib/executive-rank-guard';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access';
import { getRankPayMatrix } from '../../executive/settings/rank-matrix-actions';
import InductionForm from '../InductionForm';
import { provisionSMPortalAccess } from '../sm-portal/actions';
import { uploadEmployeeHrDocumentsFromForm } from '../../../../../packages/supabase/employee-hr-documents';
import {
  UserPlus, ShieldCheck, FileSignature,
  BookOpen, ClipboardList, Home, KeyRound,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HROnboardingPage() {
  const rankMatrix = await getRankPayMatrix();
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const editorProfile = user
    ? await fetchBackOfficeUserProfile(db, user)
    : { role: null, full_name: null };
  const canManageExecutive = canManageExecutiveAccess(editorProfile.role);

  async function onboardEmployee(formData: FormData) {
    'use server';
    const db = await createSupabaseServerClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('You must be signed in.');

    const profile = await fetchBackOfficeUserProfile(db, user);
    assertHrPortalEditor(profile.role);

    const corporateGroup = (formData.get('corporate_group') as string)?.trim() || '';
    const rank = ((formData.get('rank') as string) || '').trim().toUpperCase();
    const matrix = await getRankPayMatrix();

    assertCanAssignRank(profile.role, rank);

    if (!corporateGroup) {
      throw new Error('Corporate group is required.');
    }
    if (!isRankValidForCorporateGroup(matrix, corporateGroup, rank)) {
      throw new Error(
        `Rank "${rank}" is not valid for ${corporateGroup}. Define it in MD Settings → Rank Pay Matrix.`,
      );
    }

    const rankEntry = findRankPayEntry(matrix, rank);
    const baseFromMatrix = rankEntry?.basicPay ?? null;
    const empNumber = ((formData.get('emp_number') as string) || '').trim().toUpperCase();
    const companyId = await resolveCompanyIdForSession(db);

    if (!companyId) {
      throw new Error('Could not resolve company for this session. Sign in as MD, OD, or HR.');
    }

    if (corporateGroup === 'SECTOR_MANAGER' && !empNumber) {
      throw new Error('Employee number is required for Sector Managers (SM portal login ID).');
    }

    const insertData = {
      company_id: companyId,
      full_name: (formData.get('full_name') as string).toUpperCase(),
      nic: (formData.get('nic') as string).toUpperCase(),
      passport_no: (formData.get('passport_no') as string)?.trim().toUpperCase() || null,
      epf_no: (formData.get('epf_no') as string)?.trim() || null,
      phone: formData.get('phone') as string,
      dob: formData.get('dob') as string || null,
      gender: formData.get('gender') as string || null,
      nationality: (formData.get('nationality') as string).toUpperCase(),
      religion: (formData.get('religion') as string).toUpperCase(),
      home_address: (formData.get('home_address') as string).toUpperCase(),
      group: corporateGroup,
      rank,
      site:
        corporateGroup === 'GUARD'
          ? ((formData.get('assigned_site') as string) || null)
          : null,
      base_salary: formData.get('base_salary')
        ? parseFloat(formData.get('base_salary') as string)
        : baseFromMatrix,
      salary_type: formData.get('salary_type') as string,
      bank_code: formData.get('bank_code') as string || null,
      branch_code: formData.get('branch_code') as string || null,
      account_number: formData.get('bank_acc') as string || null,
      epf_yn: formData.get('epf_yn') === 'YES',
      mod_expiry: formData.get('mod_expiry') as string,
      police_expiry: formData.get('police_expiry') as string,
      date_joined: new Date().toISOString().split('T')[0],
      status: 'ACTIVE',
      ...(empNumber ? { emp_number: empNumber } : {}),
    };

    const { data: inserted, error } = await db
      .from('employees')
      .insert([insertData])
      .select('id')
      .single();

    if (error) {
      console.error('\n[HR] SUPABASE ERROR:', error.message, '\n');
      throw new Error(error.message);
    }

    if (inserted?.id) {
      await uploadEmployeeHrDocumentsFromForm(db, inserted.id, formData);
    }

    revalidatePath('/hr/onboarding');
    revalidatePath('/hr/mnr');

    if (corporateGroup === 'SECTOR_MANAGER' && empNumber) {
      const provision = await provisionSMPortalAccess(empNumber);
      if (provision.error || !provision.success || !provision.otp) {
        throw new Error(
          provision.error ??
            'Sector Manager was saved but SM portal access could not be provisioned. Use SM Portal Access to generate an OTP manually.',
        );
      }

      const jar = await cookies();
      jar.set(
        'sm_portal_provision_flash',
        JSON.stringify({
          epf: provision.epf,
          otp: provision.otp,
          smName: provision.smName,
        }),
        { httpOnly: true, maxAge: 180, path: '/', sameSite: 'lax' },
      );
      redirect('/hr/sm-portal');
    }
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 space-y-6">

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
          <Link href="/hr" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm">
            <Home className="w-3.5 h-3.5" /> HR Desk
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 mt-5 pt-4 border-t border-slate-200">
          <Link href="/hr/mnr" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all uppercase tracking-wide">
            <BookOpen className="w-3.5 h-3.5 text-rose-600" /> Master Nominal Roll
          </Link>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black rounded-xl uppercase tracking-wider">
            <UserPlus className="w-3.5 h-3.5" /> Onboarding
          </span>
          <Link href="/hr/clearance" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all uppercase tracking-wide">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" /> Clearance Desk
          </Link>
          <Link href="/hr/temp-roster" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all uppercase tracking-wide">
            <ClipboardList className="w-3.5 h-3.5 text-violet-600" /> Temp Roster
          </Link>
          <Link href="/hr/sm-portal" className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black rounded-xl hover:bg-amber-100 transition-all uppercase tracking-wider">
            <KeyRound className="w-3.5 h-3.5" /> SM Portal
          </Link>
        </div>
      </header>

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
            canManageExecutive={canManageExecutive}
          />
        </section>
      </div>
    </div>
  );
}
