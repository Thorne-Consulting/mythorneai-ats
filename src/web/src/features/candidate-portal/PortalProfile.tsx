'use client';

import { useMemo, useState } from 'react';
import { Button, Card, CardBody, Input, PageHeader, SearchSelect, toast } from '@/components/ui';
import { usePortal } from './PortalProvider';
import { usePortalData } from './PortalShell';

const HOME = { label: 'Home', href: '/candidate-portal/home' };

type Form = {
  firstName: string;
  lastName: string;
  phone: string;
  location: string;
  linkedInUrl: string;
  timeZone: string;
};

function zones() {
  let ids: string[];
  try {
    ids = Intl.supportedValuesOf('timeZone');
  } catch {
    ids = [Intl.DateTimeFormat().resolvedOptions().timeZone];
  }
  return ids.map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') }));
}

/** /candidate-portal/profile: the contact details the hiring team sees, which the candidate can fix. */
export function PortalProfile() {
  const portal = usePortalData();
  const { call, reload } = usePortal();
  const c = portal.candidate;
  const saved: Form = {
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone ?? '',
    location: c.location ?? '',
    linkedInUrl: c.linkedInUrl ?? '',
    timeZone: c.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  const [form, setForm] = useState<Form>(saved);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);
  const zoneOptions = useMemo(zones, []);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const field = (key: keyof Form) => ({
    value: form[key],
    error: errors[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [key]: event.target.value }));
      setErrors(({ [key]: _, ...rest }) => rest);
    },
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { ok, response } = await call(
      '/public/portal/profile',
      form,
      'We could not save your details. Check them and try again.',
      'PUT',
    );
    if (ok) {
      toast.success('Details saved');
      await reload();
    } else if (response?.status === 400) {
      const body = await response.json().catch(() => null);
      const next: typeof errors = {};
      for (const [key, value] of Object.entries(body?.errors ?? {}))
        next[key as keyof Form] = (value as string[])[0];
      setErrors(next);
    }
    setBusy(false);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[HOME]}
        title="Your details"
        description="The hiring team sees these on every application you send."
      />
      <Card>
        <form onSubmit={save}>
          <CardBody className="grid gap-4 pt-5 sm:grid-cols-2">
            <Input label="First name" required autoComplete="given-name" {...field('firstName')} />
            <Input label="Last name" required autoComplete="family-name" {...field('lastName')} />
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-fg">Email</p>
              <p className="mt-1 text-base break-all text-fg">{c.email}</p>
              <p className="mt-1 text-xs text-fg-subtle">
                You sign in with this address. To use another one, message the hiring team.
              </p>
            </div>
            <Input
              label="Phone"
              type="tel"
              autoComplete="tel"
              description="With the country code, for example +1 312 555 0142."
              {...field('phone')}
            />
            <Input
              label="Location"
              autoComplete="address-level2"
              description="City and country, for example Chicago, United States."
              {...field('location')}
            />
            <Input
              label="LinkedIn profile"
              type="url"
              placeholder="https://www.linkedin.com/in/your-name"
              {...field('linkedInUrl')}
            />
            <SearchSelect
              label="Time zone"
              description="We show interview times in this zone."
              data={zoneOptions}
              value={form.timeZone}
              error={errors.timeZone}
              onChange={(value) => value && setForm((f) => ({ ...f, timeZone: value }))}
            />
          </CardBody>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle px-5 py-3">
            <Button
              variant="secondary"
              type="button"
              disabled={!dirty || busy}
              onClick={() => {
                setForm(saved);
                setErrors({});
              }}
            >
              Discard
            </Button>
            <Button type="submit" loading={busy} disabled={!dirty}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
