'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Kbd, Modal, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue, useHotkeys } from '@mantine/hooks';
import { IconAddressBook, IconBriefcase2, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';

type SearchResult = {
  requisitions: Array<{ id: string; code: string; title: string }>;
  candidates: Array<{ id: string; name: string; email: string }>;
};

type Hit = { key: string; href: string; title: string; meta: string; kind: 'job' | 'person' };

/** Sidebar trigger: looks like a field, opens the palette. "/" and ⌘K open it from anywhere. */
export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <UnstyledButton className="search-trigger" onClick={onOpen} aria-label="Search jobs and people">
      <IconSearch size={15} aria-hidden />
      <span className="search-trigger-label">Search</span>
      <Kbd size="xs">/</Kbd>
    </UnstyledButton>
  );
}

export function CommandSearch({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [debounced] = useDebouncedValue(query, 200);
  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchResult>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  });

  const hits = useMemo<Hit[]>(
    () => [
      ...(results.data?.candidates ?? []).map((item) => ({
        key: `c-${item.id}`,
        href: `/candidates/${item.id}`,
        title: item.name,
        meta: item.email,
        kind: 'person' as const,
      })),
      ...(results.data?.requisitions ?? []).map((item) => ({
        key: `j-${item.id}`,
        href: `/requisitions/${item.id}`,
        title: item.title,
        meta: item.code,
        kind: 'job' as const,
      })),
    ],
    [results.data],
  );

  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    if (!opened) setQuery('');
  }, [opened]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const searching = debounced.trim().length >= 2;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      padding={0}
      radius="lg"
      size={560}
      yOffset="12vh"
      centered={false}
      transitionProps={{ duration: 120 }}
      aria-label="Search"
    >
      <TextInput
        data-autofocus
        size="md"
        variant="unstyled"
        className="command-input"
        placeholder="Find a person or a job…"
        aria-label="Search jobs and people"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        leftSection={<IconSearch size={17} aria-hidden />}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, hits.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && hits[active]) {
            event.preventDefault();
            go(hits[active].href);
          }
        }}
      />
      <Box className="command-results" role="listbox" aria-label="Results">
        {!searching && (
          <Text size="sm" c="dimmed" px="md" py="sm">
            Type a name, an email or a job title.
          </Text>
        )}
        {searching && results.isFetching && !results.data && (
          <Text size="sm" c="dimmed" px="md" py="sm">
            Searching…
          </Text>
        )}
        {searching && results.data && hits.length === 0 && (
          <Text size="sm" c="dimmed" px="md" py="sm">
            Nothing matches “{debounced.trim()}”.
          </Text>
        )}
        {hits.map((hit, index) => (
          <UnstyledButton
            key={hit.key}
            role="option"
            aria-selected={index === active}
            data-active={index === active || undefined}
            className="command-hit"
            onMouseEnter={() => setActive(index)}
            onClick={() => go(hit.href)}
          >
            {hit.kind === 'person' ? (
              <IconAddressBook size={16} aria-hidden />
            ) : (
              <IconBriefcase2 size={16} aria-hidden />
            )}
            <Box style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={600} truncate>
                {hit.title}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {hit.kind === 'person' ? hit.meta : `Job · ${hit.meta}`}
              </Text>
            </Box>
          </UnstyledButton>
        ))}
      </Box>
      <Box className="command-footer">
        <Text size="xs" c="dimmed">
          <Kbd size="xs">↑</Kbd> <Kbd size="xs">↓</Kbd> to move · <Kbd size="xs">Enter</Kbd> to open
          · <Kbd size="xs">Esc</Kbd> to close
        </Text>
      </Box>
    </Modal>
  );
}

/** "/" and ⌘K / Ctrl+K open search from anywhere that isn't a text field. */
export function useSearchHotkeys(open: () => void) {
  useHotkeys([
    ['/', open],
    ['mod+K', open],
  ]);
}
