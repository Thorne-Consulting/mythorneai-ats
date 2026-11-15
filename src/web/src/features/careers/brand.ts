// The employer's brand on public pages (careers site, candidate portal). No imports, so
// `brand.check.mjs` can run it with node.

/** `brand` on GET /public/organization; the same shape the careers settings page edits. */
export type PublicBrand = {
  brandColor?: string | null;
  headline?: string | null;
  introMarkdown?: string | null;
  websiteUrl?: string | null;
  socialUrls?: string[];
  requireResume?: boolean;
  logoUrl?: string | null;
  logoDarkUrl?: string | null;
  iconUrl?: string | null;
};

function luminance(hex: string) {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio of two "#rrggbb" colours, from 1 to 21. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const isHexColor = (value: string | null | undefined): value is string =>
  !!value && /^#[0-9a-fA-F]{6}$/.test(value);

/** White text on the brand colour when it reads well enough (4.5 to 1), else near-black. */
export const textOn = (color: string) =>
  contrast(color, '#ffffff') >= 4.5 ? '#ffffff' : '#111827';

/**
 * The brand colour as the primary token on public pages only: buttons, selected states and the
 * letter mark. The one place a computed colour becomes a style.
 */
export function brandStyle(color: string | null | undefined) {
  if (!isHexColor(color)) return undefined;
  return {
    '--primary': color,
    '--primary-hover': `color-mix(in srgb, ${color} 86%, black)`,
    '--primary-foreground': textOn(color),
  } as Record<string, string>;
}

const NETWORKS: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)(x|twitter)\.com$/, 'X'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)github\.com$/, 'GitHub'],
  [/(^|\.)glassdoor\.[a-z.]+$/, 'Glassdoor'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
];

/** The network a social link points at, by its address, for its label. */
export function socialName(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return NETWORKS.find(([pattern]) => pattern.test(host))?.[1] ?? host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
