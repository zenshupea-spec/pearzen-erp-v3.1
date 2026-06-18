/** Burned-in label for sensitive identity scans (NIC / passport). */
export const OFFICE_COPY_WATERMARK_TEXT = 'FOR OFFICE COPY ONLY';

export type GuardJobApplicationDocSlot =
  | 'id-front'
  | 'id-back'
  | 'servicemen-cert'
  | 'selfie';

export function shouldApplyOfficeCopyWatermark(docKey: string): boolean {
  return docKey === 'nic_passport' || docKey === 'id-front' || docKey === 'id-back';
}
