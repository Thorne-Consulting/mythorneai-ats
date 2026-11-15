'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { Alert, Button, Card, CardBody, Input, toast } from '@/components/ui';
import { PublicError, publicFetch } from './public-api';

const NEXT_STEPS = [
  'The hiring team reviews your application.',
  'We email you either way, so you always know where you stand.',
  'If it is a good fit, you pick interview times in your candidate portal.',
];

/**
 * After submitting: the application is already with the team. The email we just sent confirms the
 * address with one click; the code in it works here too, for people reading email on another device.
 */
export function ApplicationSent({
  jobTitle,
  applicationId,
  email,
  onFixEmail,
}: {
  jobTitle: string;
  applicationId: string;
  email: string;
  onFixEmail: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(30);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function verify(value: string) {
    setBusy(true);
    setError('');
    try {
      // The answer also sets the portal session cookie, so the portal opens signed in.
      const result = await publicFetch<{ applicationId: string }>('/public/applications/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: value,
          applicationId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      toast.success('Email confirmed');
      router.push(`/candidate-portal/applications/${result.applicationId}`);
      return;
    } catch (e) {
      setError(
        e instanceof PublicError && e.status === 400
          ? 'That code is wrong or too old. Check the newest email from us and try again.'
          : (e as Error).message,
      );
    }
    setBusy(false);
  }

  async function resend() {
    try {
      await publicFetch(`/public/applications/${applicationId}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setWait(30);
      setCode('');
      toast.success('Email sent again', `Check ${email}. Use the newest code.`);
    } catch (e) {
      toast.error('We could not send the email', (e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-5 pt-6">
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 size-7 shrink-0 text-tone-green-dot"
              strokeWidth={1.75}
              aria-hidden
            />
            <div>
              <h2 className="text-xl font-semibold text-fg">Your application is in</h2>
              <p className="mt-1 text-base text-fg-muted">
                Thank you for applying for {jobTitle}. The hiring team has it now.
              </p>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-base font-semibold text-fg">What happens next</h3>
            <ol className="space-y-3">
              {NEXT_STEPS.map((step, i) => (
                <li key={step} className="flex gap-3 text-base text-fg">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground tnum"
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 size-6 shrink-0 text-tone-blue-dot" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-fg">Confirm your email</h2>
              <p className="mt-1 text-base text-fg-muted">
                We sent an email to <span className="font-medium break-all text-fg">{email}</span>.
                Click the link in it to confirm and open your candidate portal.
              </p>
              <p className="mt-1 text-sm text-fg-subtle">
                Not you?{' '}
                <Button variant="link" size="sm" onClick={onFixEmail}>
                  Fix your email
                </Button>
              </p>
            </div>
          </div>
          <form
            className="space-y-2 border-t border-border-subtle pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.trim().length === 6) verify(code.trim());
            }}
          >
            <label htmlFor="sent-code" className="block text-sm text-fg-muted">
              Reading email on another device? Enter the 6-digit code from it here.
            </label>
            <div className="flex gap-2">
              <Input
                id="sent-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                className="w-40"
                inputClassName="tnum tracking-[0.2em]"
                onChange={(event) => {
                  const value = event.currentTarget.value.replace(/\D/g, '');
                  setCode(value);
                  if (value.length === 6 && !busy) verify(value);
                }}
              />
              <Button type="submit" variant="secondary" loading={busy} disabled={code.length < 6}>
                Confirm
              </Button>
            </div>
          </form>
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="text-sm text-fg-subtle">
            No email after a few minutes? Check your spam folder, or{' '}
            {wait > 0 ? (
              <span className="tnum">send it again in {wait} seconds</span>
            ) : (
              <Button variant="link" size="sm" onClick={resend}>
                send it again
              </Button>
            )}
            . Applied for this job before? Then the email links to that application instead.
          </p>
        </CardBody>
      </Card>

      <div className="flex justify-center">
        <Button asChild variant="secondary">
          <Link href="/careers">See other jobs</Link>
        </Button>
      </div>
    </div>
  );
}
