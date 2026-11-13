'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Alert, Avatar, Button, Card, Spinner } from '@/components/ui';
import { useQuery } from '@tanstack/react-query';
import { api, resetCsrfToken } from '@/api';
import { humanize } from '@/lib/format';
import type { User } from '@/types';

type DevUser = Pick<User, 'email' | 'displayName' | 'role'>;

export function LoginPage({ unavailable = false }: { unavailable?: boolean }) {
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const users = useQuery({
    queryKey: ['dev-users'],
    queryFn: () => api.get<DevUser[]>('/api/auth/dev-users'),
    retry: false,
  });

  const login = async (email: string) => {
    setSigningIn(email);
    try {
      resetCsrfToken();
      await api.devLogin(email);
      window.location.assign('/');
    } finally {
      setSigningIn(null);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/mark.png"
            alt=""
            width={56}
            height={56}
            className="size-14 rounded-full"
          />
          <h1 className="mt-2 text-2xl font-bold text-fg">MyThorneAI ATS</h1>
          <p className="text-base text-fg-muted">Sign in with your company account.</p>
        </div>

        <Card className="p-5">
          {users.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-5 text-fg-subtle" />
            </div>
          ) : users.data ? (
            <div className="flex flex-col gap-1">
              <p className="mb-1 text-xs font-medium text-fg-subtle">
                Test accounts (development only)
              </p>
              {users.data.map((user) => (
                <button
                  key={user.email}
                  type="button"
                  disabled={signingIn !== null}
                  onClick={() => login(user.email)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Avatar name={user.displayName} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium text-fg">
                      {user.displayName}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {humanize(user.role)}
                    </span>
                  </span>
                  {signingIn === user.email ? (
                    <Spinner className="text-fg-subtle" />
                  ) : (
                    <ArrowRight className="size-4 text-fg-subtle" aria-hidden />
                  )}
                </button>
              ))}
              <p className="mt-2 text-xs text-fg-subtle">
                On the live site, people sign in with their company account.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {unavailable && (
                <Alert tone="danger">
                  Sign-in is not working right now. Try again later, or ask your admin.
                </Alert>
              )}
              <Button asChild size="lg" fullWidth>
                <a href="/auth/login?returnUrl=/">
                  Sign in
                  <ArrowRight />
                </a>
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
