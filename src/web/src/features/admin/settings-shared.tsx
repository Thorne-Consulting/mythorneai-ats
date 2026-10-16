'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Box, Button, Divider, Group, Paper, Text } from '@mantine/core';

/** Local editable copy of server data; resets whenever the server copy changes. */
export function useDraft<T>(source: T) {
  const serialized = JSON.stringify(source);
  const [draft, setDraft] = useState<T>(source);
  useEffect(() => {
    setDraft(JSON.parse(serialized) as T);
  }, [serialized]);
  return {
    draft,
    set: (patch: Partial<T>) => setDraft((current) => ({ ...current, ...patch })),
    replace: setDraft,
    dirty: JSON.stringify(draft) !== serialized,
    reset: () => setDraft(JSON.parse(serialized) as T),
  };
}

export function SettingsSection({
  id,
  title,
  description,
  dirty,
  saving,
  onSave,
  saveLabel = 'Save',
  children,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  saveLabel?: string;
  children: ReactNode;
}) {
  return (
    <Paper withBorder radius="lg" id={id} component="section" aria-labelledby={`${id}-title`}>
      <Box p="lg">
        <Text fw={650} id={`${id}-title`}>
          {title}
        </Text>
        {description && (
          <Text size="sm" c="dimmed" maw={680}>
            {description}
          </Text>
        )}
      </Box>
      <Divider />
      <Box p="lg">{children}</Box>
      {onSave && (
        <>
          <Divider />
          <Group p="md" px="lg" justify="flex-end" gap="md">
            {dirty && (
              <Badge variant="light" color="gray" tt="none">
                Unsaved changes
              </Badge>
            )}
            <Button onClick={onSave} loading={saving} disabled={!dirty}>
              {saveLabel}
            </Button>
          </Group>
        </>
      )}
    </Paper>
  );
}
