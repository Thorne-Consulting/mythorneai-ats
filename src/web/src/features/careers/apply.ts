// Rules for the apply form, kept pure so `apply.check.mjs` can run them with node.
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

export type Details = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedInUrl: string;
};
export type DetailKey = keyof Details;
export const EMPTY_DETAILS: Details = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  location: '',
  linkedInUrl: '',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "en-US" → "US", the country a phone number without a + most likely belongs to. */
export function countryFromLocale(locale: string | undefined): CountryCode | undefined {
  const region = locale?.split(/[-_]/)[1]?.toUpperCase();
  return region && /^[A-Z]{2}$/.test(region) ? (region as CountryCode) : undefined;
}

/** A dialable number in international form ("+1 312 555 0142"), or null when it is not one. */
export function phoneNumber(value: string, country?: CountryCode) {
  const parsed = parsePhoneNumberFromString(value.trim(), country);
  return parsed?.isValid() ? parsed.formatInternational() : null;
}

/** One message per field that needs fixing. Optional fields are checked only when filled in. */
export function validate(d: Details, country?: CountryCode) {
  const errors: Partial<Record<DetailKey, string>> = {};
  if (!d.firstName.trim()) errors.firstName = 'Enter your first name.';
  if (!d.lastName.trim()) errors.lastName = 'Enter your last name.';
  if (!d.email.trim()) errors.email = 'Enter your email address.';
  else if (!EMAIL.test(d.email.trim())) errors.email = 'Enter an email like name@example.com.';
  if (d.phone.trim() && !phoneNumber(d.phone, country))
    errors.phone =
      'Enter a full phone number. Start with + and the country code if you are outside your country.';
  const url = d.linkedInUrl.trim();
  if (url && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(url))
    errors.linkedInUrl = 'Paste the full link, starting with https://';
  return errors;
}

/**
 * Fill empty fields from the resume. Anything the person already typed stays. Returns the new
 * details and which fields were filled, so the form can mark them "From your resume".
 */
export function autofill(current: Details, found: Partial<Record<DetailKey, string | null>>) {
  const next = { ...current };
  const filled: DetailKey[] = [];
  for (const key of Object.keys(EMPTY_DETAILS) as DetailKey[]) {
    const value = found[key]?.trim();
    if (value && !current[key].trim()) {
      next[key] = value;
      filled.push(key);
    }
  }
  return { next, filled };
}

/** "2 fields need attention" for the summary at the top of the form. */
export const attentionText = (count: number) =>
  `${count} ${count === 1 ? 'field needs' : 'fields need'} attention`;
