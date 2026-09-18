'use client';

import { useState } from 'react';
import {
  Badge,
  Card,
  Modal,
  MantineProvider,
  Table,
  Tabs,
  Textarea,
  Tooltip,
  createTheme,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  autoContrast: true,
  cursorType: 'pointer',
  focusRing: 'auto',
  fontSmoothing: true,
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  // Dense dashboard scale: 14px body, 13px secondary, 12px meta.
  fontSizes: {
    xs: '0.6875rem',
    sm: '0.8125rem',
    md: '0.875rem',
    lg: '1rem',
    xl: '1.125rem',
  },
  lineHeights: { xs: '1.45', sm: '1.5', md: '1.55', lg: '1.5', xl: '1.45' },
  headings: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontWeight: '600',
    sizes: {
      h1: { fontSize: 'var(--page-title-size)', lineHeight: '1.15', fontWeight: '650' },
      h2: { fontSize: '1.375rem', lineHeight: '1.25' },
      h3: { fontSize: '1.0625rem', lineHeight: '1.3' },
      h4: { fontSize: '0.9375rem', lineHeight: '1.35' },
      h5: { fontSize: '0.875rem', lineHeight: '1.4' },
      h6: { fontSize: '0.8125rem', lineHeight: '1.4' },
    },
  },
  // ponytail: component defaults instead of repeating withBorder/radius on every page.
  // Paper is deliberately left alone — Menu/Popover/Modal render through it.
  components: {
    Card: Card.extend({ defaultProps: { withBorder: true, radius: 'lg', padding: 'lg' } }),
    Table: Table.extend({
      defaultProps: { verticalSpacing: 'md', horizontalSpacing: 'lg', highlightOnHover: true },
      styles: {
        th: {
          fontSize: 'var(--mantine-font-size-xs)',
          fontWeight: 600,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          color: 'var(--mantine-color-dimmed)',
        },
        td: { fontVariantNumeric: 'tabular-nums' },
      },
    }),
    Modal: Modal.extend({
      defaultProps: { centered: true, radius: 'lg', overlayProps: { blur: 2 } },
      styles: { title: { fontWeight: 650, fontSize: 'var(--mantine-font-size-lg)' } },
    }),
    Badge: Badge.extend({ defaultProps: { tt: 'none', fw: 600 } }),
    // minRows is ignored unless the textarea autosizes.
    Textarea: Textarea.extend({ defaultProps: { autosize: true, maxRows: 16 } }),
    Tooltip: Tooltip.extend({ defaultProps: { withArrow: true, openDelay: 300 } }),
    Tabs: Tabs.extend({ defaultProps: { keepMounted: false } }),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" limit={3} />
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MantineProvider>
  );
}
