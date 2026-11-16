import { getCountries } from 'libphonenumber-js/min';

let names: Intl.DisplayNames | null = null;

/** "US" → "United States", in English; the code itself when unknown. */
export function countryName(code: string) {
  names ??= new Intl.DisplayNames(['en'], { type: 'region' });
  try {
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

let options: { value: string; label: string }[] | null = null;

/** Every country (ISO code and English name), by name, for pickers. */
export function countryOptions() {
  options ??= getCountries()
    .map((code) => ({ value: code, label: countryName(code) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return options;
}
