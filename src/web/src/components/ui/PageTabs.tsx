'use client';

import { Badge, Tabs } from '@mantine/core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface PageTab {
  label: string;
  href: string;
  count?: number;
}

export function PageTabs({ items }: { items: PageTab[] }) {
  const pathname = usePathname() ?? '';
  const active =
    items
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? items[0]?.href;

  return (
    <Tabs value={active} mb={32}>
      <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {items.map((item) => (
          <Tabs.Tab
            key={item.href}
            value={item.href}
            // These tabs are links to other pages, so there is no panel for aria-controls to point at.
            renderRoot={(props) => <Link href={item.href} {...props} aria-controls={undefined} />}
            rightSection={
              !item.count ? undefined : (
                <Badge size="xs" variant="default" circle>
                  {item.count}
                </Badge>
              )
            }
          >
            {item.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
