/**
 * A link target from user-supplied data (a candidate's LinkedIn, a parsed resume), or undefined
 * when it is not a plain web address. Blocks `javascript:` and other schemes that would run code
 * or open something other than a page when clicked.
 */
export function safeWebUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
