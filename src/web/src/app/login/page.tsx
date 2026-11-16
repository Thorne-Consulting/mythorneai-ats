import type { Metadata } from 'next';
import { LoginPage } from '@/features/auth/LoginPage';

export const metadata: Metadata = { title: 'Sign in' };

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Where the sign-in service sends people back with a reason (?error=), and where sign-out lands. */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  return (
    <LoginPage
      error={one(params.error)}
      returnUrl={one(params.returnUrl) ?? '/'}
      request={one(params.request)}
      signedOut={one(params.signedOut) === '1'}
    />
  );
}
