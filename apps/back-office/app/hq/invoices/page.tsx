import { redirect } from 'next/navigation';

/** Legacy path — hub and bookmarks should use /invoice-desk */
export default function HQInvoicesRedirectPage() {
  redirect('/invoice-desk');
}
