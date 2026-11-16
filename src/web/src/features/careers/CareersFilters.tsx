'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import {
  Button,
  Checkbox,
  Drawer,
  Menu,
  MenuContent,
  MenuCheckboxItem,
  MenuTrigger,
  SearchInput,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useDebouncedValue } from '@/lib/hooks';
import type { Filters } from './CareersBoard';
import { workModeLabel } from './jobs';
import type { Facet, PublicFacets } from './public-api';

type Key = 'department' | 'location' | 'mode';

/** The address for a set of filters. The server reads it and renders the matching jobs. */
export function boardHref(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  for (const key of ['department', 'location', 'mode'] as const)
    for (const value of filters[key]) params.append(key, value);
  if (filters.embed) params.set('embed', '1');
  const query = params.toString();
  return query ? `/careers?${query}` : '/careers';
}

/**
 * Search plus department, location and work mode filters, each allowing several values. Every
 * change goes into the address. On a phone the three filters move into one "Filters" drawer.
 */
export function CareersFilters({
  facets,
  filters: fromServer,
}: {
  facets: PublicFacets;
  filters: Filters;
}) {
  // Kept here too, so quick changes build on each other before the server answers.
  const [filters, setFilters] = useState(fromServer);
  const serverKey = JSON.stringify(fromServer);
  useEffect(() => setFilters(JSON.parse(serverKey) as Filters), [serverKey]);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.q);
  const query = useDebouncedValue(search.trim(), 300);
  const [drawer, setDrawer] = useState(false);

  const go = (next: Filters) => {
    setFilters(next);
    startTransition(() => router.replace(boardHref(next), { scroll: false }));
  };
  const set = (key: Key, values: string[]) => go({ ...filters, [key]: values });

  useEffect(() => {
    if (query !== filters.q) go({ ...filters, q: query });
    // Only the typed text drives this; the other filters come along as they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const groups: { key: Key; label: string; all: string; options: Facet[] }[] = [
    { key: 'department', label: 'Department', all: 'All departments', options: facets.departments },
    { key: 'location', label: 'Location', all: 'All locations', options: facets.locations },
    { key: 'mode', label: 'Work mode', all: 'Any work mode', options: facets.workModes },
  ];
  const active = filters.department.length + filters.location.length + filters.mode.length;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search jobs"
        aria-label="Search jobs"
        className="min-w-0 flex-1 sm:max-w-xs"
      />
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {groups.map((g) => (
          <FacetMenu
            key={g.key}
            label={g.label}
            allLabel={g.all}
            options={g.options}
            selected={filters[g.key]}
            format={g.key === 'mode' ? workModeLabel : undefined}
            onChange={(values) => set(g.key, values)}
          />
        ))}
        {active > 0 && (
          <Button asChild variant="link" size="sm">
            <Link href={boardHref({ ...filters, department: [], location: [], mode: [] })} replace>
              Clear filters
            </Link>
          </Button>
        )}
      </div>
      <Button
        variant="secondary"
        className="sm:hidden"
        leftIcon={<SlidersHorizontal />}
        onClick={() => setDrawer(true)}
        aria-label={active ? `Filters, ${active} on` : 'Filters'}
      >
        Filters{active > 0 && <span className="tnum"> · {active}</span>}
      </Button>
      <Drawer
        opened={drawer}
        onClose={() => setDrawer(false)}
        title="Filters"
        size="sm"
        footer={
          <>
            {active > 0 && (
              <Button
                variant="secondary"
                onClick={() => go({ ...filters, department: [], location: [], mode: [] })}
              >
                Clear filters
              </Button>
            )}
            <Button onClick={() => setDrawer(false)}>Show jobs</Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <fieldset key={g.key} className="flex flex-col gap-2.5">
              <legend className="mb-2 text-base font-semibold text-fg">{g.label}</legend>
              {g.options.map((o) => {
                const on = filters[g.key].includes(o.value);
                return (
                  <Checkbox
                    key={o.value}
                    className="w-full"
                    checked={on}
                    onCheckedChange={(checked) =>
                      set(
                        g.key,
                        checked
                          ? [...filters[g.key], o.value]
                          : filters[g.key].filter((v) => v !== o.value),
                      )
                    }
                    label={
                      <span className="flex w-full justify-between gap-3">
                        <span>{g.key === 'mode' ? workModeLabel(o.value) : o.value}</span>
                        <span className="text-fg-subtle tnum">{o.count}</span>
                      </span>
                    }
                  />
                );
              })}
            </fieldset>
          ))}
        </div>
      </Drawer>
    </div>
  );
}

/** A filter button that opens a checklist with counts; several values can be on at once. */
function FacetMenu({
  label,
  allLabel,
  options,
  selected,
  format = (v) => v,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: Facet[];
  selected: string[];
  format?: (value: string) => string;
  onChange: (values: string[]) => void;
}) {
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? format(selected[0])
        : `${label}: ${selected.length}`;
  return (
    <Menu>
      <MenuTrigger
        aria-label={`${label}: ${selected.length ? selected.map(format).join(', ') : allLabel}`}
        className={cn(
          'inline-flex h-[38px] items-center gap-2 rounded-md border border-border bg-card px-3 text-base font-medium text-fg-muted transition-colors hover:bg-accent hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:border-primary',
          selected.length > 0 && 'border-primary/40 bg-accent text-accent-foreground',
        )}
      >
        <span className="max-w-44 truncate">{summary}</span>
        <ChevronDown className="size-4" aria-hidden />
      </MenuTrigger>
      <MenuContent align="start" className="max-h-80 overflow-y-auto">
        {options.map((o) => (
          <MenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={(checked) =>
              onChange(
                checked ? [...selected, o.value] : selected.filter((value) => value !== o.value),
              )
            }
          >
            <span className="flex flex-1 justify-between gap-4">
              <span>{format(o.value)}</span>
              <span className="text-fg-subtle tnum">{o.count}</span>
            </span>
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
