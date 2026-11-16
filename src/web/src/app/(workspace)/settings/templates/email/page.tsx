import { redirect } from 'next/navigation';

// Automatic emails live in the one template library now.
export default function Page() {
  redirect('/messages/templates?tab=automatic');
}
