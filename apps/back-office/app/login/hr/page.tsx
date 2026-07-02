import { redirect } from 'next/navigation';

/** HR staff sign in at the HQ staff portal — canonical URL is /login/hq. */
export default async function HrStaffLoginAliasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (val == null) continue;
    if (Array.isArray(val)) {
      for (const v of val) qs.append(key, v);
    } else {
      qs.set(key, val);
    }
  }
  const suffix = qs.toString();
  redirect(suffix ? `/login/hq?${suffix}` : '/login/hq');
}
