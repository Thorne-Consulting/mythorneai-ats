// Money as people read it, and conversion through a rate table. Plain TS (no imports), so
// money.check.mjs runs it with node.

/** One currency from GET /api/currencies or GET /public/currencies. */
export type CurrencyInfo = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  supported?: boolean;
};

/** The last good rate table: rates per one unit of `base`, from `date`. */
export type RateTable = {
  base: string;
  date: string;
  fetchedAt?: string;
  rates: Record<string, number>;
};

/**
 * The flag emoji for a currency: the first two letters of an ISO 4217 code are the country
 * (USD → US), and EU draws the European flag. Supranational codes (XAF, XCD) have none.
 */
export function flagOf(code: string) {
  const country = code.toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(country) || country.startsWith('X')) return '';
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** "🇺🇸 USD" for pickers; just the code when there is no flag. */
export function currencyOption(code: string) {
  const flag = flagOf(code);
  return { value: code, label: flag ? `${flag} ${code}` : code };
}

/** Converts through the table's base: amount / rate[from] * rate[to]. Null when a side has no rate. */
export function convert(amount: number, from: string, to: string, table: RateTable | null) {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b) return amount;
  if (!table) return null;
  const rate = (code: string) =>
    code === table.base.toUpperCase() ? 1 : table.rates[code] > 0 ? table.rates[code] : null;
  const x = rate(a);
  const y = rate(b);
  return x == null || y == null ? null : (amount / x) * y;
}

/** "$150,000" or "¥5,000,000": the symbol and the currency's decimals. Unknown code: "XYZ 150,000". */
export function formatMoney(amount: number, code: string, info?: CurrencyInfo | null) {
  if (!info)
    return `${code.toUpperCase()} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const number = amount.toLocaleString('en-US', {
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  });
  const spaced = info.symbol.length > 1 && /[A-Za-z]$/.test(info.symbol);
  return spaced ? `${info.symbol} ${number}` : `${info.symbol}${number}`;
}

/** "$90,000 – $120,000", or one amount. */
export function formatRange(
  min: number | null,
  max: number | null,
  code: string,
  info?: CurrencyInfo | null,
) {
  const amounts = [min, max].filter((v): v is number => v != null);
  if (amounts.length === 0) return null;
  const one = (n: number) => formatMoney(n, code, info);
  return amounts.length === 2 && amounts[0] !== amounts[1]
    ? `${one(amounts[0])} – ${one(amounts[1])}`
    : one(amounts[0]);
}

export const PERIOD_LABEL: Record<string, string> = {
  Year: 'per year',
  Month: 'per month',
  Hour: 'per hour',
  Day: 'per day',
};

/** "rates from November 14, 2026", from the table's date ("2026-11-14"). */
export function ratesFrom(table: RateTable | null) {
  if (!table) return null;
  const date = new Date(`${table.date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `rates from ${date}`;
}

export type PayTermsView = {
  amount: string;
  currency: string;
  period: string;
  /** The same range in the visitor's currency, with the rates date, or a note why not. */
  converted: string | null;
  convertedNote: string | null;
};

/**
 * The pay on a posting as clear terms. The job's own amount and currency stay the source of
 * truth; the converted line is a display for a visitor who chose another currency.
 */
export function payTerms(
  salary: { min: number | null; max: number | null; currency: string; period: string },
  visitor: string,
  currencies: CurrencyInfo[],
  table: RateTable | null,
): PayTermsView | null {
  const info = (code: string) => currencies.find((c) => c.code === code.toUpperCase()) ?? null;
  const own = info(salary.currency);
  const amount = formatRange(salary.min, salary.max, salary.currency, own);
  if (!amount) return null;
  const period = PERIOD_LABEL[salary.period] ?? 'per year';
  const view: PayTermsView = {
    amount,
    currency: own ? `${own.code} (${own.name})` : salary.currency.toUpperCase(),
    period,
    converted: null,
    convertedNote: null,
  };
  if (visitor.toUpperCase() === salary.currency.toUpperCase()) return view;
  const min = salary.min == null ? null : convert(salary.min, salary.currency, visitor, table);
  const max = salary.max == null ? null : convert(salary.max, salary.currency, visitor, table);
  const converted = formatRange(
    min == null ? null : Math.round(min),
    max == null ? null : Math.round(max),
    visitor,
    info(visitor),
  );
  if (!converted || (salary.min != null && min == null) || (salary.max != null && max == null)) {
    view.convertedNote = `No rate for ${visitor.toUpperCase()} yet. The amount is shown as posted.`;
    return view;
  }
  view.converted = `About ${converted} ${period}`;
  view.convertedNote = ratesFrom(table);
  return view;
}
