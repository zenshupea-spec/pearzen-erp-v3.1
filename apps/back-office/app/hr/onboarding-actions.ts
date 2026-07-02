'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import {
  findRankPayEntry,
  isRankValidForHrAssignment,
} from '../../../../packages/rank-pay-matrix';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../lib/company-context-server';
import {
  formatHrDocumentUploadWarning,
  uploadCompressedEmployeeHrDocumentsFromForm,
} from '../../lib/hr-document-upload';
import { gramaNiladariExpiryError } from '../../lib/hr-vetting-validation';
import { assertCanAssignRank } from '../../lib/executive-rank-guard';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../lib/hr-portal-access-server';
import { getRankPayMatrix } from '../executive/settings/rank-matrix-actions';
import { getInternalWorkLocationsForMnr } from '../executive/settings/internal-work-locations-actions';
import { formatInternalBranchLabel } from '../../lib/internal-work-locations';
import { executeRosterMerge } from './temp-roster/actions';
import { provisionCafePortalAccess } from './cafe-portal/actions';
import { provisionSMPortalAccess } from './sm-portal/actions';
import { encryptEmployeePiiRecord, getEmployeePiiEncryptionError } from '../../lib/employee-pii';
import {
  assertEpfDiffersFromPrevious,
  assertEpfNoUnique,
  friendlyEpfSaveError,
  normalizeEpfNo,
} from '../../lib/employee-epf';
import { resolveSalaryOverrideApproval } from '../../lib/hr-salary-override';
import { assertSingletonPortalRankAvailable } from '../../lib/singleton-portal-rank-guard';
import { employmentPayComponentsFromFormData } from '../../lib/employee-pay-components';
import { normalizeHrSectorName } from '../../lib/hr-sectors';
import type { OnboardingGuardSite } from './onboarding-types';
import { HO_RANK_PENDING_ASSIGNMENT } from './onboarding-types';
import { getHrSectorNames } from './hr-sector-actions';

export type OnboardEmployeeState = {
  error?: string;
  warning?: string;
  /** Client navigates here — server redirect() hangs useActionState transitions. */
  redirectTo?: string;
};

function fail(message: string): OnboardEmployeeState {
  return { error: message };
}

function combineWarnings(...parts: Array<string | undefined>): string | undefined {
  const messages = parts.map((part) => part?.trim()).filter(Boolean) as string[];
  if (messages.length === 0) return undefined;
  return messages.join(' ');
}

function formatMergeWarning(tempId: string, error: string): string {
  return `Employee was saved to Master Nominal Roll, but temp roster ${tempId} could not be merged (${error}). Open Temp Roster to complete the merge manually.`;
}

function formatSmProvisionWarning(epf: string, detail: string): string {
  return `Employee was saved to Master Nominal Roll. SM portal access could not be provisioned for ${epf} (${detail}). Generate an OTP on this desk.`;
}

function formatCafeProvisionWarning(epf: string, detail: string): string {
  return `Employee was saved to Master Nominal Roll. Café front access could not be provisioned for ${epf} (${detail}). Generate an OTP on this desk.`;
}

async function setOnboardingFlashCookie(
  cookieName: string,
  payload: Record<string, unknown>,
) {
  const jar = await cookies();
  jar.set(cookieName, JSON.stringify(payload), {
    httpOnly: true,
    maxAge: 300,
    path: '/',
    sameSite: 'lax',
  });
}

function assertOrFail(assertFn: () => void): OnboardEmployeeState | null {
  try {
    assertFn();
    return null;
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Validation failed.');
  }
}

export async function getOnboardingGuardSites(): Promise<OnboardingGuardSite[]> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  let query = supabase
    .from('site_profiles')
    .select('id, site_name, site_status')
    .neq('site_status', 'ARCHIVED')
    .order('site_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[HR Onboarding] Guard sites load error:', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => ({
      id: String(row.id),
      siteName: String(row.site_name ?? '').trim(),
    }))
    .filter((row) => row.siteName.length > 0);
}

export async function onboardEmployee(
  _prev: OnboardEmployeeState | null,
  formData: FormData,
): Promise<OnboardEmployeeState> {
  try {
    const db = await createSupabaseServerClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return fail('You must be signed in to onboard employees.');

    const profile = await fetchBackOfficeUserProfile(db, user);
    const editorGate = assertOrFail(() => assertHrPortalEditor(profile.role));
    if (editorGate) return editorGate;

    const piiError = getEmployeePiiEncryptionError();
    if (piiError) {
      return fail(
        `Employee PII encryption is not configured. Set ENCRYPTION_KEY (32 characters) before onboarding.`,
      );
    }

    const fullName = ((formData.get('full_name') as string) || '').trim();
    const nic = ((formData.get('nic') as string) || '').trim();
    const phone = ((formData.get('phone') as string) || '').trim();

    if (!fullName) return fail('Full name is required.');
    if (!nic) return fail('NIC is required.');
    if (!phone) return fail('Phone number is required.');

    const corporateGroup = (formData.get('corporate_group') as string)?.trim().toUpperCase() || '';
    const rank = ((formData.get('rank') as string) || '').trim().toUpperCase();
    const isSmRank = rank === 'SM';
    const matrix = await getRankPayMatrix();
    const companyId = await resolveCompanyIdForSession(db);

    if (!companyId) {
      return fail('Could not resolve company for this session. Sign in as MD, OD, or HR.');
    }

    const rankGate = rank
      ? assertOrFail(() => assertCanAssignRank(profile.role, rank))
      : null;
    if (rankGate) return rankGate;

    if (!corporateGroup) return fail('Corporate group is required.');
    if (corporateGroup === 'SECTOR_MANAGER') {
      return fail('Use Head Office as corporate group with SM rank for Sector Managers.');
    }

    if (!rank) {
      if (corporateGroup !== 'HEAD_OFFICE') {
        return fail('Assigned rank is required.');
      }
    } else if (!isRankValidForHrAssignment(matrix, corporateGroup, rank)) {
      return fail(
        `Rank "${rank}" is not valid for ${corporateGroup}. Define it in MD Settings → Rank Pay Matrix.`,
      );
    }

    if (rank) {
      try {
        await assertSingletonPortalRankAvailable(rank, companyId);
      } catch (err) {
        return fail(
          err instanceof Error ? err.message : 'That portal rank is already assigned.',
        );
      }
    }

    const rankEntry = rank ? findRankPayEntry(matrix, rank) : null;
    const baseFromMatrix = rankEntry?.basicPay ?? null;
    const empNumber = ((formData.get('emp_number') as string) || '').trim().toUpperCase();

    const resolvedBaseSalary = formData.get('base_salary')
      ? parseFloat(formData.get('base_salary') as string)
      : baseFromMatrix;
    const salaryApproval = resolveSalaryOverrideApproval(
      matrix,
      rank || null,
      resolvedBaseSalary,
    );

    const epfNo = normalizeEpfNo((formData.get('epf_no') as string) || '');
    const previousEpfNo = normalizeEpfNo((formData.get('previous_epf_no') as string) || '');
    const rosterEmpNumber = (empNumber || epfNo || '').trim().toUpperCase();

    if (isSmRank && !rosterEmpNumber) {
      return fail(
        'New EPF No is required for Sector Managers — it becomes the SM portal login ID (Section 1).',
      );
    }

    let smSector: string | null = null;
    if (isSmRank) {
      if (corporateGroup !== 'HEAD_OFFICE') {
        return fail('Sector Managers must be inducted under Head Office with SM rank.');
      }
      smSector = normalizeHrSectorName(formData.get('assigned_sector') as string);
      if (!smSector) {
        return fail('Assigned sector is required for Sector Managers.');
      }
      const allowedSectors = await getHrSectorNames();
      if (!allowedSectors.includes(smSector)) {
        return fail(
          `Sector "${smSector}" is not in the HR sector list. Pick from the dropdown or add it first.`,
        );
      }
    }

    const assignedSiteRaw = formatInternalBranchLabel(
      (formData.get('assigned_site') as string) || '',
    );
    const needsInternalBranch =
      (corporateGroup === 'CAFE' || corporateGroup === 'HEAD_OFFICE') && !isSmRank;
    if (needsInternalBranch) {
      const internalWorkLocations = await getInternalWorkLocationsForMnr();
      const branchOptions =
        corporateGroup === 'CAFE'
          ? internalWorkLocations.cafe
          : internalWorkLocations.headOffice;
      if (branchOptions.length > 0) {
        if (!assignedSiteRaw) {
          return fail(
            corporateGroup === 'CAFE'
              ? 'Select a café branch configured in MD Settings → Operations.'
              : 'Select a head office branch configured in MD Settings → Operations.',
          );
        }
        const branchValid = branchOptions.some(
          (loc) => formatInternalBranchLabel(loc.name) === assignedSiteRaw,
        );
        if (!branchValid) {
          return fail(
            'Selected branch is not in MD Settings. Refresh the page after saving Operations branches.',
          );
        }
      }
    }

    const employeeGroup = isSmRank ? 'HEAD_OFFICE' : corporateGroup;
    const savedRank =
      rank ||
      (corporateGroup === 'HEAD_OFFICE' ? HO_RANK_PENDING_ASSIGNMENT : '');

    const emailRaw = ((formData.get('email') as string) || '').trim().toLowerCase();
    if (emailRaw) {
      const { data: emailRows, error: emailLookupError } = await db
        .from('employees')
        .select('id, full_name, email')
        .not('email', 'is', null);
      if (emailLookupError) {
        return fail(emailLookupError.message);
      }
      const conflict = (emailRows ?? []).find(
        (row) =>
          typeof row.email === 'string' &&
          row.email.trim().toLowerCase() === emailRaw,
      );
      if (conflict) {
        return fail(
          `Work email is already in use by ${String(conflict.full_name ?? 'another employee')}.`,
        );
      }
    }

    const epfDiffGate = assertOrFail(() => assertEpfDiffersFromPrevious(epfNo, previousEpfNo));
    if (epfDiffGate) return epfDiffGate;

    try {
      const epfDb = createSupabaseServiceClient();
      await assertEpfNoUnique(epfDb, epfNo, { companyId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'EPF number is already in use.';
      return fail(friendlyEpfSaveError(message));
    }

    const gramaDocFile = formData.get('hr_doc_grama_niladari');
    const gramaExpiryRaw = (formData.get('grama_niladari_expiry') as string)?.trim() || null;
    const gramaExpiryValidation = gramaNiladariExpiryError({
      gramaNiladariUrl:
        gramaDocFile instanceof File && gramaDocFile.size > 0 ? 'pending-upload' : null,
      gramaNiladariExpiry: gramaExpiryRaw,
    });
    if (gramaExpiryValidation) {
      return fail(gramaExpiryValidation);
    }

    const insertData = encryptEmployeePiiRecord({
      company_id: companyId,
      full_name: fullName.toUpperCase(),
      email: emailRaw || null,
      nic: nic.toUpperCase(),
      passport_no: (formData.get('passport_no') as string)?.trim().toUpperCase() || null,
      epf_no: epfNo || null,
      previous_epf_no: previousEpfNo || null,
      phone,
      dob: (formData.get('dob') as string) || null,
      gender: (formData.get('gender') as string) || null,
      nationality: (formData.get('nationality') as string).toUpperCase(),
      religion: (formData.get('religion') as string)?.trim().toUpperCase() || null,
      home_address: (formData.get('home_address') as string).toUpperCase(),
      group: employeeGroup,
      rank: savedRank,
      site:
        corporateGroup === 'GUARD'
          ? (assignedSiteRaw || null)
          : isSmRank
            ? smSector
            : needsInternalBranch
              ? assignedSiteRaw || null
              : null,
      base_salary: resolvedBaseSalary,
      ...employmentPayComponentsFromFormData(formData),
      salary_type: formData.get('salary_type') as string,
      requires_md_approval: salaryApproval.requires_md_approval,
      salary_approval_status: salaryApproval.salary_approval_status,
      custom_salary: salaryApproval.custom_salary,
      bank_code: (formData.get('bank_code') as string) || null,
      branch_code: (formData.get('branch_code') as string) || null,
      account_number: (formData.get('bank_acc') as string) || null,
      epf_yn: formData.get('epf_yn') === 'YES',
      grama_niladari_expiry: (formData.get('grama_niladari_expiry') as string)?.trim() || null,
      date_joined: new Date().toISOString().split('T')[0],
      status: 'ACTIVE',
      section_edits: {
        personal: {
          at: new Date().toISOString(),
          by: 'HR Onboarding',
        },
      },
      ...(rosterEmpNumber ? { emp_number: rosterEmpNumber } : {}),
    });

    const { data: inserted, error } = await db
      .from('employees')
      .insert([insertData])
      .select('id')
      .single();

    if (error) {
      console.error('\n[HR] SUPABASE ERROR:', error.message, '\n');
      return fail(friendlyEpfSaveError(error.message));
    }

    let docWarning: string | undefined;
    let mergeWarning: string | undefined;

    if (inserted?.id) {
      const docsDb = createSupabaseServiceClient();
      const docUploadResult = await uploadCompressedEmployeeHrDocumentsFromForm(
        docsDb,
        inserted.id,
        formData,
      );
      docWarning = formatHrDocumentUploadWarning(docUploadResult);
      if (docUploadResult.failed.length > 0) {
        console.error(
          '[HR] Document upload failures:',
          docUploadResult.failed.map((f) => `${f.docType}: ${f.error}`).join('; '),
        );
      }
    }

    const shadowTempId = ((formData.get('temp_emp_id') as string) || '').trim();
    if (shadowTempId && inserted?.id) {
      const mergeResult = await executeRosterMerge(shadowTempId, inserted.id);
      if (!mergeResult.success) {
        mergeWarning = formatMergeWarning(shadowTempId.toUpperCase(), mergeResult.error);
        console.error('[HR] Temp roster merge failed:', mergeResult.error);
        revalidatePath('/hr/temp-roster');
      }
    }

    const onboardingWarning = combineWarnings(docWarning, mergeWarning);

    revalidatePath('/hr/onboarding');
    revalidatePath('/hr/mnr');
    revalidatePath('/fm/exceptions');
    if (employeeGroup === 'HEAD_OFFICE') {
      revalidatePath('/executive/settings');
    }

    if (isSmRank && rosterEmpNumber) {
      revalidatePath('/executive/sites');
      revalidatePath('/hr/sm-portal');
      const provision = await provisionSMPortalAccess(rosterEmpNumber);
      if (provision.error || !provision.success || !provision.otp) {
        const provisionWarning = combineWarnings(
          onboardingWarning,
          formatSmProvisionWarning(
            rosterEmpNumber,
            provision.error ??
              'Portal provisioning failed. Generate an OTP manually on this desk.',
          ),
        );
        await setOnboardingFlashCookie('sm_portal_provision_flash', {
          epf: rosterEmpNumber,
          smName: fullName,
          provisionWarning,
        });
        return {
          warning: provisionWarning,
          redirectTo: '/hr/sm-portal',
        };
      }

      await setOnboardingFlashCookie('sm_portal_provision_flash', {
        epf: provision.epf,
        otp: provision.otp,
        smName: provision.smName,
        ...(onboardingWarning ? { docWarning: onboardingWarning } : {}),
      });
      return {
        ...(onboardingWarning ? { warning: onboardingWarning } : {}),
        redirectTo: '/hr/sm-portal',
      };
    }

    if (corporateGroup === 'CAFE' && epfNo) {
      const provision = await provisionCafePortalAccess(epfNo);
      if (provision.error || !provision.success || !provision.otp) {
        const provisionWarning = combineWarnings(
          onboardingWarning,
          formatCafeProvisionWarning(
            epfNo,
            provision.error ??
              'Portal provisioning failed. Generate an OTP manually on this desk.',
          ),
        );
        await setOnboardingFlashCookie('cafe_portal_provision_flash', {
          epf: epfNo,
          staffName: fullName,
          provisionWarning,
        });
        return {
          warning: provisionWarning,
          redirectTo: '/hr/cafe-portal',
        };
      }

      await setOnboardingFlashCookie('cafe_portal_provision_flash', {
        epf: provision.epf,
        otp: provision.otp,
        staffName: provision.staffName,
        ...(onboardingWarning ? { docWarning: onboardingWarning } : {}),
      });
      return {
        ...(onboardingWarning ? { warning: onboardingWarning } : {}),
        redirectTo: '/hr/cafe-portal',
      };
    }

    return {
      ...(onboardingWarning ? { warning: onboardingWarning } : {}),
      redirectTo: '/hr/mnr',
    };
  } catch (err) {
    console.error('[HR] Onboarding error:', err);
    return fail(err instanceof Error ? err.message : 'Onboarding failed. Try again or contact IT.');
  }
}
