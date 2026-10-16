import type { ReactNode } from 'react';
import { Anchor, Box, Group, Text, Title } from '@mantine/core';
import Link from 'next/link';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb={24}>
      <Box style={{ flex: '1 1 320px' }}>
        <Title order={1}>{title}</Title>
        {description && (
          <Text c="dimmed" mt={6} maw={680}>
            {description}
          </Text>
        )}
      </Box>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}

export interface Crumb {
  label: string;
  href: string;
}

/**
 * Header for one record (an application, a job, a person). The trail says where it lives, the
 * title says what it is, and actions sit on the right. Pass `crumbs` for a full trail; the older
 * `backHref`/`backLabel` pair still works and becomes a one-step trail.
 */
export function DetailHeader({
  backHref,
  backLabel,
  crumbs,
  title,
  badges,
  subtitle,
  meta,
  actions,
}: {
  backHref?: string;
  backLabel?: string;
  crumbs?: Crumb[];
  // Kept for existing callers; the header no longer draws it.
  current?: string;
  avatar?: ReactNode;
  title: string;
  badges?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const trail = crumbs ?? (backHref && backLabel ? [{ label: backLabel, href: backHref }] : []);
  return (
    <Box component="header" className="record-header">
      {trail.length > 0 && (
        <nav aria-label="Breadcrumb" className="crumbs">
          {trail.map((crumb, index) => (
            <span key={crumb.href} className="crumb">
              {index > 0 && (
                <span className="crumb-sep" aria-hidden>
                  /
                </span>
              )}
              <Anchor component={Link} href={crumb.href} size="sm" c="dimmed">
                {crumb.label}
              </Anchor>
            </span>
          ))}
        </nav>
      )}
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Box style={{ flex: '1 1 340px', minWidth: 0 }}>
          <Group gap="sm" wrap="wrap" align="center">
            <Title order={1}>{title}</Title>
            {badges}
          </Group>
          {subtitle && (
            <Text c="dimmed" mt={4}>
              {subtitle}
            </Text>
          )}
          {meta}
        </Box>
        {actions && (
          <Group gap="sm" wrap="wrap">
            {actions}
          </Group>
        )}
      </Group>
    </Box>
  );
}
