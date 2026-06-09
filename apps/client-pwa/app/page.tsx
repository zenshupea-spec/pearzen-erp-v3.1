import { CustomerMenu } from '../components/CustomerMenu';
import { loadPublicMenuPageData } from '../lib/menu-server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { companyId, items, branding, error } = await loadPublicMenuPageData();

  return (
    <CustomerMenu
      companyId={companyId}
      items={items}
      branding={branding}
      initialError={error}
    />
  );
}
