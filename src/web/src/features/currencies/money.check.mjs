// Run: node --experimental-strip-types src/features/currencies/money.check.mjs
import assert from 'node:assert/strict';
import {
  convert,
  currencyOption,
  flagOf,
  formatMoney,
  formatRange,
  payTerms,
  ratesFrom,
} from './money.ts';

const table = { base: 'EUR', date: '2026-11-14', rates: { USD: 1.1, GBP: 0.85, JPY: 165 } };
const currencies = [
  { code: 'USD', name: 'US dollar', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'Pound sterling', symbol: '£', decimals: 2 },
  { code: 'JPY', name: 'Japanese yen', symbol: '¥', decimals: 0 },
  { code: 'CHF', name: 'Swiss franc', symbol: 'CHF', decimals: 2 },
];

// Cross rates go through the base: USD -> GBP is 110 / 1.1 * 0.85.
assert.ok(Math.abs(convert(110, 'USD', 'GBP', table) - 85) < 1e-9);
assert.equal(convert(10, 'EUR', 'JPY', table), 1650);
assert.equal(convert(5, 'usd', 'USD', null), 5);
assert.equal(convert(5, 'USD', 'GBP', null), null);
assert.equal(convert(5, 'USD', 'CHF', table), null);

assert.equal(formatMoney(150000, 'USD', currencies[0]), '$150,000.00');
assert.equal(formatMoney(5000000.4, 'JPY', currencies[3]), '¥5,000,000');
assert.equal(formatMoney(1234.5, 'CHF', currencies[4]), 'CHF 1,234.50');
assert.equal(formatMoney(1234.5, 'XYZ'), 'XYZ 1,234.5');
assert.equal(formatRange(90000, 120000, 'USD', currencies[0]), '$90,000.00 – $120,000.00');
assert.equal(formatRange(30, 30, 'USD', currencies[0]), '$30.00');
assert.equal(formatRange(null, null, 'USD'), null);
assert.equal(ratesFrom(table), 'rates from November 14, 2026');

const salary = { min: 90000, max: 120000, currency: 'USD', period: 'Year' };
const same = payTerms(salary, 'USD', currencies, table);
assert.equal(same.amount, '$90,000.00 – $120,000.00');
assert.equal(same.currency, 'USD (US dollar)');
assert.equal(same.period, 'per year');
assert.equal(same.converted, null);
const gbp = payTerms(salary, 'GBP', currencies, table);
assert.equal(gbp.converted, 'About £69,545.00 – £92,727.00 per year');
assert.equal(gbp.convertedNote, 'rates from November 14, 2026');
const none = payTerms(salary, 'GBP', currencies, null);
assert.equal(none.converted, null);
assert.match(none.convertedNote, /No rate for GBP yet/);
assert.equal(payTerms({ ...salary, min: null, max: null }, 'GBP', currencies, table), null);
assert.equal(flagOf('USD'), '🇺🇸');
assert.equal(flagOf('eur'), '🇪🇺');
assert.equal(flagOf('XAF'), '');
assert.deepEqual(currencyOption('GBP'), { value: 'GBP', label: '🇬🇧 GBP' });
assert.deepEqual(currencyOption('XCD'), { value: 'XCD', label: 'XCD' });
console.log('money ok');
