import type { Metadata } from 'next';
import localFont from 'next/font/local';
import '../styles.css';
import { themeScript } from '@/lib/theme';
import { Providers } from './providers';

// Roboto from the npm package, so a build never fetches from Google and works offline.
const roboto = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2',
      style: 'normal',
    },
    {
      path: '../../node_modules/@fontsource-variable/roboto/files/roboto-latin-wght-italic.woff2',
      style: 'italic',
    },
  ],
  weight: '100 900',
  display: 'swap',
  variable: '--font-roboto',
});

export const metadata: Metadata = {
  title: { default: 'MyThorneAI ATS', template: '%s · MyThorneAI ATS' },
  description: 'Smarter hiring. Brighter futures.',
  icons: { icon: '/brand/mark.png' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={roboto.variable} suppressHydrationWarning>
      <head>
        {/* Must run inline before first paint (no theme flash). next/script beforeInteractive is
            queued until Next boots, which flashes; keep this plain script. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
