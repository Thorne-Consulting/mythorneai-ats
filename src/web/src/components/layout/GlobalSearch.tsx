'use client';

import { useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Kbd,
  Paper,
  Text,
  TextInput,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { useClickOutside, useDebouncedValue, useHotkeys } from '@mantine/hooks';
import { IconAddressBook, IconBriefcase2, IconSearch, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '../../api';

export function GlobalSearch() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 250);
  const clickOutsideRef = useClickOutside(() => setSearch(''));
  const inputRef = useRef<HTMLInputElement>(null);
  // "/" focuses search, matching the hint in the field. Mantine ignores the
  // hotkey while an input already has focus.
  useHotkeys([['/', () => inputRef.current?.focus()]]);
  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () =>
      api.get<{
        requisitions: Array<{ id: string; code: string; title: string }>;
        candidates: Array<{ id: string; name: string; email: string }>;
      }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  });
  const open = search.trim().length >= 2;
  const go = (path: string) => {
    setSearch('');
    router.push(path);
  };
  const empty =
    results.data && results.data.requisitions.length === 0 && results.data.candidates.length === 0;

  return (
    <Box ref={clickOutsideRef} pos="relative" style={{ flex: 1, maxWidth: 520 }}>
      <TextInput
        ref={inputRef}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          setSearch('');
          event.currentTarget.blur();
        }}
        placeholder="Search candidates and jobs…"
        aria-label="Search candidates and jobs"
        leftSection={<IconSearch size={16} />}
        rightSection={
          search ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <IconX size={15} />
            </ActionIcon>
          ) : (
            <Kbd size="xs" visibleFrom="md">
              /
            </Kbd>
          )
        }
        rightSectionWidth={search ? undefined : 40}
      />
      {open && (
        <Paper className="search-results" withBorder radius="md" shadow="lg">
          {results.isFetching && !results.data && (
            <Text size="sm" c="dimmed" p="md">
              Searching…
            </Text>
          )}
          {results.data?.requisitions.map((item) => (
            <UnstyledButton
              key={item.id}
              className="search-result"
              onClick={() => go(`/requisitions/${item.id}`)}
            >
              <ThemeIcon variant="light" color="indigo" size="sm">
                <IconBriefcase2 size={13} />
              </ThemeIcon>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>
                  {item.title}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {item.code} · Job
                </Text>
              </Box>
            </UnstyledButton>
          ))}
          {results.data?.candidates.map((item) => (
            <UnstyledButton
              key={item.id}
              className="search-result"
              onClick={() => go(`/candidates/${item.id}`)}
            >
              <ThemeIcon variant="light" color="teal" size="sm">
                <IconAddressBook size={13} />
              </ThemeIcon>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>
                  {item.name}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {item.email}
                </Text>
              </Box>
            </UnstyledButton>
          ))}
          {empty && (
            <Text size="sm" c="dimmed" p="md">
              No matching records
            </Text>
          )}
        </Paper>
      )}
    </Box>
  );
}
