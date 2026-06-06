import { redirect } from 'next/navigation';

/** Legacy mock recruitment page — live intake is HR onboarding / temp roster. */
export default function HqRecruitmentRedirectPage() {
  redirect('/hr/onboarding');
}
