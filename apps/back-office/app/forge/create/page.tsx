import { redirect } from 'next/navigation';

/** Legacy route — tenant provisioning moved to /forge/companies/new (S-31 guardrails). */
export default function LegacyForgeCreateRedirect() {
  redirect('/forge/companies/new');
}
