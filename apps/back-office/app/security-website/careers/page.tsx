import { getPublicGuardVacancies } from '../../hr/vacancies/actions';
import { resolveSecurityWebsiteCompanyId } from '../../../lib/security-website-data';
import CareersPageClient from './CareersPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Careers | Pearzen Security',
  description:
    'Open security guard vacancies across Classic Venture client sites in Sri Lanka.',
};

export default async function CareersPage() {
  const companyId = await resolveSecurityWebsiteCompanyId();
  const { sites, error } = await getPublicGuardVacancies(companyId);

  return <CareersPageClient sites={sites} error={error} />;
}
