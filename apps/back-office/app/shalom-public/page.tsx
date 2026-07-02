import { buildShalomPublicPageMetadata } from '../../lib/shalom-public-seo';
import ShalomPublicHomePageContent from '../../components/shalom-public/ShalomPublicHomePageContent';

export const metadata = buildShalomPublicPageMetadata({
  title: 'Find your stay',
  path: '/',
});

export default function ShalomPublicHomePage() {
  return <ShalomPublicHomePageContent />;
}
