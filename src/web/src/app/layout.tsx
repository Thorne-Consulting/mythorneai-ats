import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import '../styles.css';
import { themeScript } from '@/lib/theme';
import { Providers } from './providers';

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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
