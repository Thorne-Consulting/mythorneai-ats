'use client';

import { Alert, Button, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Could not load this page">
      <Stack align="flex-start" mt="sm">
        The ATS could not reach its data service. Your changes were not lost.
        <Button color="red" variant="light" onClick={reset}>
          Try again
        </Button>
      </Stack>
    </Alert>
  );
}
