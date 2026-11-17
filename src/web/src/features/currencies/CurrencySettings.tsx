'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge, Button, Checkbox, SearchInput, Select } from '@/components/ui';
import { SettingsHeader } from '@/features/admin/SettingsShell';
import { SettingsLoading, SettingsSection, useDraft } from '@/features/admin/settings-shared';
import { useCurrencies, useRefreshRates, useSaveCurrencies } from './currency-data';
import { flagOf, ratesFrom } from './money';

/**
 * Settings › Currencies. An admin picks the base currency (what totals and reports are shown in)
 * and the currencies a job or an offer may use. The rate table converts between them.
 */
export function CurrencySettings() {
  const query = useCurrencies();
  const save = useSaveCurrencies();
  const refresh = useRefreshRates();
  const data = query.data;
  const [filter, setFilter] = useState('');
  const { draft, set, dirty, reset } = useDraft({
    base: data?.base ?? 'USD',
    supported: data?.currencies.filter((c) => c.supported).map((c) => c.code) ?? [],
  });
  if (!data) return <SettingsLoading rows={6} />;

  const toggle = (code: string, on: boolean) =>
    set({
      supported: on ? [...draft.supported, code] : draft.supported.filter((c) => c !== code),
    });
  const rates = data.rates;
  const words = filter.trim().toLowerCase();
  const shown = data.currencies.filter(
    (c) => !words || `${c.code} ${c.name}`.toLowerCase().includes(words),
  );
  return (
    <>
      <SettingsHeader />
      <div className="space-y-5">
        <SettingsSection
          id="currencies"
          title="Base and supported currencies"
          description="Pay on a job or an offer is kept in its own currency. Reports and totals convert to the base currency."
          dirty={dirty}
          saving={save.isPending}
          onSave={() => save.mutate(draft, { onSuccess: () => undefined })}
          onDiscard={reset}
        >
          <div className="space-y-5">
            <Select
              label="Base currency"
              description="The currency that totals, averages and comparisons are shown in. It is always supported."
              className="max-w-sm"
              value={draft.base}
              onChange={(base) => base && set({ base })}
              data={data.currencies.map((c) => ({
                value: c.code,
                label: `${flagOf(c.code)} ${c.code} · ${c.name}`.trim(),
              }))}
            />
            <fieldset>
              <legend className="text-sm font-medium text-fg">Supported currencies</legend>
              <p className="mt-1 mb-3 text-sm text-fg-subtle">
                People choose from these when they set pay on a job or terms on an offer.{' '}
                {draft.supported.length} of {data.currencies.length} are on.
              </p>
              <SearchInput
                className="mb-3 max-w-sm"
                placeholder="Find a currency by code or name"
                value={filter}
                onValueChange={setFilter}
              />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((c) => {
                  const isBase = c.code === draft.base;
                  return (
                    <Checkbox
                      key={c.code}
                      label={`${flagOf(c.code)} ${c.code} · ${c.name} (${c.symbol})`.trim()}
                      checked={isBase || draft.supported.includes(c.code)}
                      disabled={isBase}
                      onCheckedChange={(on) => toggle(c.code, on)}
                    />
                  );
                })}
              </div>
            </fieldset>
          </div>
        </SettingsSection>

        <SettingsSection
          id="rates"
          title="Exchange rates"
          description="Daily reference rates from Frankfurter, which blends 112 central banks. A table is kept for a day, and the last good one stays until a new one arrives."
          action={
            <Button
              variant="secondary"
              leftIcon={<RefreshCw />}
              loading={refresh.isPending}
              disabled={!data.conversionEnabled}
              onClick={() => refresh.mutate()}
            >
              Refresh rates now
            </Button>
          }
        >
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-fg-subtle">Status</dt>
            <dd>
              {!data.conversionEnabled ? (
                <Badge tone="gray">Conversion is off on this server</Badge>
              ) : rates ? (
                <Badge tone="green">{ratesFrom(rates)}</Badge>
              ) : (
                <Badge tone="amber">No rates yet. Amounts are shown as entered.</Badge>
              )}
            </dd>
            {rates && (
              <>
                <dt className="text-fg-subtle">Last fetched</dt>
                <dd className="text-fg">
                  {rates.fetchedAt ? new Date(rates.fetchedAt).toLocaleString() : '–'}
                </dd>
                <dt className="text-fg-subtle">Currencies with a rate</dt>
                <dd className="text-fg">{Object.keys(rates.rates).length + 1}</dd>
              </>
            )}
            <dt className="text-fg-subtle">Source</dt>
            <dd className="break-all text-fg">{data.source}</dd>
          </dl>
        </SettingsSection>
      </div>
    </>
  );
}
