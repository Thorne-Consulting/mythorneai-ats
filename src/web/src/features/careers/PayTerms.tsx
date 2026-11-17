'use client';

import { useEffect, useState } from 'react';
import { Select } from '@/components/ui';
import { currencyOption, flagOf, payTerms } from '@/features/currencies/money';
import type { PublicJob } from './public-api';
import type { PublicCurrencies } from './server';

type Salary = NonNullable<PublicJob['salary']>;

const KEY = 'careers-currency';
const EVENT = 'careers-currency';

/**
 * The currency the visitor chose, kept in local storage and shared by every pay view on the
 * page. Until they choose, it is the workspace's base currency.
 */
function useVisitorCurrency(currencies: PublicCurrencies) {
  const [code, setCode] = useState(currencies.base);
  useEffect(() => {
    const read = () => {
      const saved = localStorage.getItem(KEY);
      if (saved && currencies.currencies.some((c) => c.code === saved)) setCode(saved);
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, [currencies]);
  const choose = (next: string) => {
    localStorage.setItem(KEY, next);
    setCode(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [code, choose] as const;
}

/**
 * The pay on a posting as clear terms: the amount, the currency, the period, and the same range
 * in the visitor's currency on its own line. The job's amount and currency are the truth; the
 * converted line is a display from the daily reference rates.
 */
export function PayTerms({ salary, currencies }: { salary: Salary; currencies: PublicCurrencies }) {
  const [code, choose] = useVisitorCurrency(currencies);
  const terms = payTerms(salary, code, currencies.currencies, currencies.rates);
  if (!terms) return null;
  const rows: [string, string][] = [
    ['Amount', terms.amount],
    ['Currency', `${flagOf(salary.currency)} ${terms.currency}`.trim()],
    ['Period', terms.period],
  ];
  return (
    <section aria-labelledby="job-pay" className="max-w-[68ch] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="job-pay" className="text-lg font-semibold text-fg">
          Pay
        </h2>
        {currencies.currencies.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            Show in
            <Select
              size="sm"
              aria-label="Show pay in"
              className="w-28"
              value={code}
              onChange={(next) => next && choose(next)}
              data={currencies.currencies.map((c) => currencyOption(c.code))}
            />
          </label>
        )}
      </div>
      <dl className="grid gap-x-6 gap-y-1.5 text-base sm:grid-cols-[auto_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-fg-subtle">{label}</dt>
            <dd className="font-medium text-fg">{value}</dd>
          </div>
        ))}
        {terms.converted && (
          <div className="contents">
            <dt className="text-fg-subtle">In {code}</dt>
            <dd className="text-fg">
              {terms.converted}
              {terms.convertedNote && (
                <span className="text-fg-subtle"> ({terms.convertedNote})</span>
              )}
            </dd>
          </div>
        )}
      </dl>
      {!terms.converted && terms.convertedNote && (
        <p className="text-sm text-fg-subtle">{terms.convertedNote}</p>
      )}
    </section>
  );
}
