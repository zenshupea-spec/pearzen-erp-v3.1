import { notFound } from 'next/navigation';

import { getSecurityWebsitePageData } from '../../actions';
import SecurityDetailPage from '../../components/SecurityDetailPage';
import {
  isSecurityIndustrySlug,
  type SecurityIndustrySlug,
} from '../../../../lib/security-website-catalog';
import { getIndustryDetailBySlug } from '../../../../lib/security-website-types';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return [
    { slug: 'banks-finance' },
    { slug: 'hotels-hospitality' },
    { slug: 'factories-boi' },
  ];
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const { content } = await getSecurityWebsitePageData();
  const detail = getIndustryDetailBySlug(content, slug);
  return {
    title: detail ? `${detail.title} | Pearzen Security` : 'Industry | Pearzen Security',
    description: detail?.description,
  };
}

export default async function SecurityIndustryDetailPage({ params }: Props) {
  const { slug } = await params;
  if (!isSecurityIndustrySlug(slug)) notFound();

  const { content } = await getSecurityWebsitePageData();
  const detail = getIndustryDetailBySlug(content, slug);
  if (!detail) notFound();

  return (
    <SecurityDetailPage kind="industry" detail={detail} slug={slug as SecurityIndustrySlug} />
  );
}
