import ShalomContactPageContent from '../../../components/shalom-public/ShalomContactPageContent';
import { buildShalomPublicPageMetadata } from '../../../lib/shalom-public-seo';

export const metadata = buildShalomPublicPageMetadata({
  title: 'Contact',
  description:
    'Get in touch with Shalom Residence — send an enquiry or call our reservations line.',
  path: '/contact',
});

export default function ShalomContactPage() {
  return <ShalomContactPageContent />;
}
