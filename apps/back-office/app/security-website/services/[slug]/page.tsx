import { notFound } from 'next/navigation';

import { getSecurityWebsitePageData } from '../../actions';
import SecurityDetailPage from '../../components/SecurityDetailPage';
import {
  isSecurityServiceSlug,
  type SecurityServiceSlug,
} from '../../../../lib/security-website-catalog';
import { getServiceDetailBySlug } from '../../../../lib/security-website-types';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return [
    { slug: 'static-guard' },
    { slug: 'mobile-patrol' },
    { slug: 'corporate-facility' },
    { slug: 'event-security' },
  ];
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const { content } = await getSecurityWebsitePageData();
  const detail = getServiceDetailBySlug(content, slug);
  return {
    title: detail ? `${detail.title} | Pearzen Security` : 'Service | Pearzen Security',
    description: detail?.description,
  };
}

export default async function SecurityServiceDetailPage({ params }: Props) {
  const { slug } = await params;
  if (!isSecurityServiceSlug(slug)) notFound();

  const { content } = await getSecurityWebsitePageData();
  const detail = getServiceDetailBySlug(content, slug);
  if (!detail) notFound();

  return (
    <SecurityDetailPage kind="service" detail={detail} slug={slug as SecurityServiceSlug} />
  );
}
