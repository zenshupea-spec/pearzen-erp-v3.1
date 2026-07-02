import { CafeComplianceSectionRedirect } from '../CafeComplianceSectionRedirect';
import { CAFE_INVENTORY_ANCHOR } from '../cafe-portal-nav';

export default function CafeInventoryDeepLinkPage() {
  return (
    <CafeComplianceSectionRedirect
      anchor={CAFE_INVENTORY_ANCHOR}
      message="Opening inventory & theft radar…"
    />
  );
}
