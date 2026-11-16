import { redirect } from 'next/navigation';

// Help opens from "Need help?" in the footer and the account menu.
export default function Page() {
  redirect('/candidate-portal/home');
}
