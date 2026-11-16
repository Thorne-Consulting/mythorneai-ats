'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, ExternalLink, LifeBuoy, Mail, Palette, SearchX, Sparkles } from 'lucide-react';
import { useCurrentUser } from '@/auth';
import { ShortcutList } from '@/components/layout/CommandSearch';
import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  CardHeader,
  CardLink,
  EmptyState,
  IconDisc,
  PageHeader,
  SearchInput,
} from '@/components/ui';
import { useAbility, type AppAbility } from '@/lib/ability';
import { GUIDES } from './guides';

const TASKS = [
  'Getting around',
  'Jobs',
  'Candidates',
  'Interviews',
  'Offers',
  'Messages',
  'Assessments',
  'Reports',
  'Careers site and portal',
  'Your team',
];

/** The guides this person can use, grouped by task. Interviews lead for people who don't run jobs. */
function guidesFor(ability: AppAbility, query: string) {
  const q = query.trim().toLowerCase();
  const order = ability.can('read', 'Job')
    ? TASKS
    : ['Interviews', ...TASKS.filter((t) => t !== 'Interviews')];
  const guides = GUIDES.filter(
    (g) =>
      (!g.allowed || g.allowed(ability)) &&
      (!q ||
        [g.title, g.task, g.picture ?? '', ...g.steps].some((text) =>
          text.toLowerCase().includes(q),
        )),
  );
  return order
    .map((task) => ({ task, guides: guides.filter((g) => g.task === task) }))
    .filter((group) => group.guides.length > 0);
}

export function HelpPage() {
  const user = useCurrentUser();
  const ability = useAbility();
  const params = useSearchParams();
  const [query, setQuery] = useState('');
  const groups = guidesFor(ability, query);
  // ?guide=feedback opens that guide, for links from elsewhere (the welcome, emails).
  const [open, setOpen] = useState<string[]>(() => {
    const asked = params?.get('guide');
    return asked ? [asked] : [groups[0]?.guides[0]?.key].filter((k): k is string => !!k);
  });

  return (
    <>
      <PageHeader
        title="Help"
        description="A short how-to for each thing you can do here, with a picture, and every keyboard shortcut."
      >
        <SearchInput
          aria-label="Search help"
          placeholder="Search help, for example “scorecard”"
          className="max-w-md"
          value={query}
          onValueChange={setQuery}
        />
      </PageHeader>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {groups.length === 0 ? (
          <Card>
            <EmptyState
              icon={SearchX}
              title="No how-to matches that"
              description="Try another word, or ask support below."
              action={
                <Button variant="secondary" onClick={() => setQuery('')}>
                  Show every how-to
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="flex min-w-0 flex-col gap-6">
            {groups.map((group) => (
              <section key={group.task} aria-labelledby={`help-${group.task}`}>
                <h2
                  id={`help-${group.task}`}
                  className="mb-2 text-xs font-semibold tracking-[0.06em] text-fg-subtle uppercase"
                >
                  {group.task}
                </h2>
                <Accordion
                  type="multiple"
                  value={query ? group.guides.map((g) => g.key) : open}
                  onValueChange={setOpen}
                  className="space-y-2"
                >
                  {group.guides.map((g) => (
                    <AccordionItem key={g.key} value={g.key} title={g.title}>
                      <ol className="list-decimal space-y-2 pl-5 text-sm text-fg-muted marker:text-fg-subtle">
                        {g.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      {g.picture && (
                        <figure className="mt-4">
                          {/* Made by tools/help-images.mjs from the dark-mode screenshots. */}
                          <img
                            src={`/help/${g.key}.png`}
                            alt={g.picture}
                            width={1440}
                            height={900}
                            loading="lazy"
                            className="w-full rounded-lg border border-border bg-well"
                          />
                          <figcaption className="mt-1.5 text-xs text-fg-subtle">
                            {g.picture}
                          </figcaption>
                        </figure>
                      )}
                      <div className="mt-4">
                        <CardLink href={g.href}>{g.link}</CardLink>
                      </div>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-5">
          {user.supportEmail && (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <IconDisc icon={LifeBuoy} size="md" />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-fg">Still stuck?</h2>
                  <p className="mt-1 text-sm text-fg-subtle">
                    Write to us, and a person on our team replies by email.
                  </p>
                </div>
              </div>
              <Button asChild variant="secondary" fullWidth leftIcon={<Mail />} className="mt-4">
                <a
                  href={`mailto:${user.supportEmail}?subject=${encodeURIComponent(`Help with MyThorneAI (${user.organizationName ?? 'workspace'})`)}`}
                >
                  Contact support
                </a>
              </Button>
              <p className="mt-2 text-center text-xs text-fg-subtle">{user.supportEmail}</p>
            </Card>
          )}

          {user.changelogUrl && (
            <a href={user.changelogUrl} target="_blank" rel="noopener noreferrer" className="group">
              <Card className="flex items-center gap-3 p-5 transition-colors group-hover:bg-muted">
                <IconDisc icon={Sparkles} tone="violet" size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-fg">What’s new</span>
                  <span className="block text-xs text-fg-subtle">
                    Recent changes to MyThorneAI.
                  </span>
                </span>
                <ExternalLink className="size-4 text-fg-subtle" aria-hidden />
              </Card>
            </a>
          )}

          <Card id="shortcuts">
            <CardHeader
              title="Keyboard shortcuts"
              description="Press ? anywhere to see these. Use Ctrl instead of ⌘ on Windows and Linux."
            />
            <ShortcutList className="px-5 pb-2" />
          </Card>

          {process.env.NODE_ENV === 'development' && (
            <Link href="/design" className="group">
              <Card className="flex items-center gap-3 p-5 transition-colors group-hover:bg-muted">
                <IconDisc icon={Palette} tone="violet" size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-fg">Design system</span>
                  <span className="block text-xs text-fg-subtle">
                    Every component in light and dark. Development only.
                  </span>
                </span>
                <ArrowRight className="size-4 text-fg-subtle" aria-hidden />
              </Card>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
