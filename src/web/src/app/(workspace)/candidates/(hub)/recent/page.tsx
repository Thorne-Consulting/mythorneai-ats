import { redirect } from 'next/navigation';

// Recently viewed profiles live in the search palette (⌘K) now.
export default function Page() {
  redirect('/candidates');
}
