import { redirect } from 'next/navigation';

/** Legacy /login — send users to head-office sign-in. */
export default function LoginPage() {
  redirect('/login/head-office');
}
