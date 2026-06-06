'use server'

import { createSupabaseServerClient, createSupabaseServiceClient } from '../../../../packages/supabase/server';
import { redirect } from 'next/navigation';
import {
  authLocalPartsForEmployee,
  canonicalEpfFromEmployee,
  epfAuthLocalPart,
  fieldPwaAuthEmail,
  fieldPwaAuthPassword,
  findEmployeeByEpf,
  isEmployeeActive,
  normalizeEpfNo,
  provisionGuardPortalAuth,
} from '../../lib/guard-auth';

export async function authenticateGuard(formData: FormData) {
  const epfInput = normalizeEpfNo((formData.get('epfNo') as string) ?? '');

  if (!epfInput) {
    return { success: false, error: 'EPF number is required.' };
  }

  const service = createSupabaseServiceClient();
  const employee = await findEmployeeByEpf(service, epfInput);

  if (!employee) {
    return {
      success: false,
      error: 'EPF number not found on the master nominal roll.',
    };
  }

  if (!isEmployeeActive(employee)) {
    return { success: false, error: 'This employee is not active.' };
  }

  const canonicalEpf = canonicalEpfFromEmployee(employee) || epfInput;
  const provision = await provisionGuardPortalAuth(service, employee);
  if (!provision.ok) {
    console.error('❌ Guard portal provision:', provision.error);
    return { success: false, error: 'Could not provision portal access. Contact HR.' };
  }

  const authParts = authLocalPartsForEmployee(employee);
  const supabase = await createSupabaseServerClient();

  let lastError: string | null = null;
  for (const localPart of authParts) {
    const email = fieldPwaAuthEmail(
      localPart === epfAuthLocalPart(canonicalEpf) ? canonicalEpf : localPart,
    );
    const passwordKey =
      localPart === epfAuthLocalPart(canonicalEpf)
        ? canonicalEpf
        : String(employee.emp_number ?? '').trim().toUpperCase();
    const password = fieldPwaAuthPassword(passwordKey);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      redirect('/');
    }
    lastError = error.message;
  }

  console.error('❌ Guard portal auth:', lastError);
  return {
    success: false,
    error: 'Invalid EPF or portal access not provisioned. Contact HR.',
  };
}
