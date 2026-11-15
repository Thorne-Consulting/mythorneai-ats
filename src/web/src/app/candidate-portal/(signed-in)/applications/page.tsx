import { redirect } from 'next/navigation';

// Home lists every application.
export default function Page() {
  redirect('/candidate-portal/home');
}
