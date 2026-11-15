'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ImageUp, Plus, Trash2, X } from 'lucide-react';
import { api, type ApiError } from '@/api';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CopyButton,
  FileButton,
  IconButton,
  Input,
  Switch,
  toast,
} from '@/components/ui';
import { imageProblem } from '@/components/editor/images';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { SettingsHeader } from '@/features/admin/SettingsShell';
import { SettingsLoading } from '@/features/admin/settings-shared';
import { contrast, isHexColor, textOn, type PublicBrand } from '@/features/careers/brand';
import { cn } from '@/lib/cn';
import { CareersPreview } from './CareersPreview';

type CareerSite = { company?: string | null; publicUrl?: string | null; brand: PublicBrand };
type Draft = {
  brandColor: string;
  headline: string;
  introMarkdown: string;
  websiteUrl: string;
  socialUrls: string[];
  requireResume: boolean;
};
type Slot = 'logo' | 'logo-dark' | 'icon';

const KEY = ['admin', 'careers-site'];
const DEFAULT_COLOR = '#2468ff';

const toDraft = (brand: PublicBrand): Draft => ({
  brandColor: brand.brandColor ?? '',
  headline: brand.headline ?? '',
  introMarkdown: brand.introMarkdown ?? '',
  websiteUrl: brand.websiteUrl ?? '',
  socialUrls: brand.socialUrls ?? [],
  requireResume: !!brand.requireResume,
});

/**
 * /settings/careers: the employer's brand on the careers site, the candidate portal and candidate
 * emails, with a live preview of the real pages at desktop and phone width.
 */
export function CareersSiteSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<CareerSite>('/api/careers-site'),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const saved = query.data ? toDraft(query.data.brand) : null;
  const current = draft ?? saved;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);

  const save = useMutation({
    mutationFn: (body: Draft) =>
      api.put<CareerSite>('/api/careers-site', {
        ...body,
        socialUrls: body.socialUrls.filter((url) => url.trim()),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      setDraft(null);
      setErrors({});
      toast.success('Careers site saved');
    },
    onError: (error: ApiError) => {
      const next: Record<string, string> = {};
      const details = error.details as { errors?: Record<string, string[]> } | undefined;
      for (const [field, list] of Object.entries(details?.errors ?? {})) next[field] = list[0];
      setErrors(next);
      toast.error('We could not save the careers site', error.message);
    },
  });

  if (!query.data || !current)
    return (
      <>
        <SettingsHeader />
        <SettingsLoading rows={6} />
      </>
    );
  const data = query.data;
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...current, ...patch });
    setErrors((e) => {
      const rest = { ...e };
      for (const key of Object.keys(patch)) delete rest[key];
      return rest;
    });
  };
  // What the preview shows: saved images plus the text and colour being edited.
  const previewBrand: PublicBrand = {
    ...data.brand,
    ...current,
    brandColor: isHexColor(current.brandColor) ? current.brandColor : null,
    socialUrls: current.socialUrls.filter((url) => /^https?:\/\/\S+\.\S+/.test(url)),
  };
  const careersUrl = `${(data.publicUrl ?? '').replace(/\/+$/, '')}/careers`;

  return (
    <>
      <SettingsHeader
        actions={
          <Button asChild variant="secondary">
            <a href="/careers" target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Open careers page
            </a>
          </Button>
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Brand" />
            <CardBody className="flex flex-col gap-5 border-t border-border-subtle pt-5">
              <ImageField
                slot="logo"
                title="Logo"
                hint="A wide logo on a clear background. PNG or JPEG, up to 2 MB."
                url={data.brand.logoUrl}
              />
              <ImageField
                slot="logo-dark"
                title="Logo for dark mode"
                hint="Optional. A light version for people who use dark mode. Without it, we show your icon and name."
                url={data.brand.logoDarkUrl}
                dark
              />
              <ImageField
                slot="icon"
                title="Icon"
                hint="A square picture, at least 192 by 192 pixels. It is the browser tab icon, the picture when a job link is shared, and the mark in emails."
                url={data.brand.iconUrl}
                square
              />
              <ColorField
                value={current.brandColor}
                error={errors.brandColor}
                onChange={(brandColor) => set({ brandColor })}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Careers page" />
            <CardBody className="flex flex-col gap-5 border-t border-border-subtle pt-5">
              <Input
                label="Headline"
                placeholder={`Work at ${data.company ?? 'our company'}`}
                description="The large title above your jobs. Leave it empty to show Open jobs."
                maxLength={120}
                value={current.headline}
                error={errors.headline}
                onChange={(e) => set({ headline: e.target.value })}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-fg">Introduction</span>
                <PlateMarkdownEditor
                  key={editorKey}
                  value={current.introMarkdown}
                  onChange={(introMarkdown) => set({ introMarkdown })}
                  placeholder="A few sentences about your company, your team and how you work."
                  invalid={!!errors.introMarkdown}
                />
                {errors.introMarkdown && (
                  <p className="text-sm text-destructive">{errors.introMarkdown}</p>
                )}
              </div>
              <Input
                label="Company website"
                type="url"
                placeholder="https://www.example.com"
                value={current.websiteUrl}
                error={errors.websiteUrl}
                onChange={(e) => set({ websiteUrl: e.target.value })}
              />
              <SocialLinks
                urls={current.socialUrls}
                error={errors.socialUrls}
                onChange={(socialUrls) => set({ socialUrls })}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Applications" />
            <CardBody className="flex flex-col gap-5 border-t border-border-subtle pt-5">
              <Switch
                checked={current.requireResume}
                onCheckedChange={(requireResume) => set({ requireResume })}
                label="Require a resume"
                description="When on, people must add a resume to apply. When off, they can apply without one."
              />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-fg">Careers page address</span>
                {data.publicUrl ? (
                  <div className="flex min-w-0 items-center gap-1">
                    <a
                      href={careersUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-base text-accent-foreground hover:underline"
                    >
                      {careersUrl}
                    </a>
                    <CopyButton value={careersUrl} label="Copy careers page address" />
                  </div>
                ) : (
                  <p className="text-sm text-fg-muted">
                    Not set yet. Add the web address of this app in{' '}
                    <Link
                      href="/settings/general"
                      className="text-accent-foreground hover:underline"
                    >
                      General
                    </Link>{' '}
                    so emails and shared links work.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>

          {dirty && (
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border-subtle bg-card px-5 py-3 shadow-pop">
              <Badge tone="amber" className="mr-auto">
                Unsaved changes
              </Badge>
              <Button
                variant="secondary"
                disabled={save.isPending}
                onClick={() => {
                  setDraft(null);
                  setErrors({});
                  setEditorKey((k) => k + 1);
                }}
              >
                Discard
              </Button>
              <Button
                loading={save.isPending}
                onClick={() => {
                  const problem = imageProblem(current.introMarkdown);
                  if (problem) setErrors((e) => ({ ...e, introMarkdown: problem }));
                  else save.mutate(current);
                }}
              >
                Save changes
              </Button>
            </div>
          )}
        </div>

        <Card className="min-w-0 xl:sticky xl:top-4">
          <CardHeader
            title="Preview"
            description={dirty ? 'Showing your unsaved changes.' : undefined}
          />
          <CardBody className="border-t border-border-subtle pt-4">
            <CareersPreview company={data.company ?? ''} brand={previewBrand} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function ImageField({
  slot,
  title,
  hint,
  url,
  dark,
  square,
}: {
  slot: Slot;
  title: string;
  hint: string;
  url?: string | null;
  dark?: boolean;
  square?: boolean;
}) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (file: File | null) =>
      file
        ? api.upload<CareerSite>(`/api/careers-site/images/${slot}`, file)
        : api.delete<CareerSite>(`/api/careers-site/images/${slot}`),
    onSuccess: (data, file) => {
      queryClient.setQueryData(KEY, data);
      toast.success(file ? `${title} uploaded` : `${title} removed`);
    },
    onError: (error: Error) =>
      toast.error(`We could not change the ${title.toLowerCase()}`, error.message),
  });
  return (
    <div className="flex items-start gap-4">
      <div
        className={cn(
          'flex h-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-subtle',
          square ? 'w-16' : 'w-28 sm:w-40',
          // The background the image will sit on.
          dark ? 'bg-chrome' : 'bg-white',
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded images of any size
          <img
            src={url}
            alt={`Your ${title.toLowerCase()}`}
            className={cn(
              'max-h-full max-w-full',
              square ? 'size-full object-cover' : 'object-contain p-2',
            )}
          />
        ) : (
          <ImageUp
            className={cn('size-5', dark ? 'text-nav-foreground' : 'text-fg-subtle')}
            aria-hidden
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-fg">{title}</p>
        <p className="text-sm text-fg-muted">{hint}</p>
        <div className="mt-2 flex items-center gap-1">
          <FileButton
            variant="secondary"
            size="sm"
            accept=".png,.jpg,.jpeg"
            loading={change.isPending && change.variables !== null}
            onFile={(file) => change.mutate(file)}
          >
            {url ? 'Replace' : 'Upload'}
          </FileButton>
          {url && (
            <Button
              variant="quiet"
              size="sm"
              leftIcon={<Trash2 />}
              disabled={change.isPending}
              onClick={() => change.mutate(null)}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ColorField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const valid = isHexColor(value);
  const shown = valid ? value : DEFAULT_COLOR;
  const darkText = valid && textOn(value) !== '#ffffff';
  // The brand colour as text or a line on the white page: below 3 to 1 it is hard to see.
  const faint = valid && contrast(value, '#ffffff') < 3;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-fg" id="brand-color-label">
        Brand colour
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          aria-labelledby="brand-color-label"
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          className="size-[38px] shrink-0 cursor-pointer rounded-md border border-input bg-card p-1"
        />
        <Input
          aria-label="Brand colour as a hex code"
          className="w-32"
          placeholder={DEFAULT_COLOR}
          maxLength={7}
          value={value}
          error={error}
          onChange={(e) => onChange(e.target.value.trim())}
        />
        <span
          className="inline-flex h-[38px] items-center rounded-md px-4 text-base font-medium"
          // The sample button in the chosen colour: a computed colour, so an inline style.
          style={{ background: shown, color: textOn(shown) }}
        >
          Apply now
        </span>
        {value && (
          <Button variant="quiet" size="sm" leftIcon={<X />} onClick={() => onChange('')}>
            Use the default
          </Button>
        )}
      </div>
      <p className="text-sm text-fg-muted">
        {!valid
          ? 'Used for buttons on your careers page, in the portal and in emails. Empty uses our blue.'
          : darkText
            ? 'This is a light colour, so buttons use dark text to stay readable.'
            : 'Buttons use white text on this colour.'}
        {faint && ' It is hard to see on white, so we keep links in blue.'}
      </p>
    </div>
  );
}

function SocialLinks({
  urls,
  error,
  onChange,
}: {
  urls: string[];
  error?: string;
  onChange: (urls: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-sm font-medium text-fg">Social links</span>
        <p className="text-sm text-fg-muted">
          For example LinkedIn, Instagram or Glassdoor. They show at the bottom of the careers page.
        </p>
      </div>
      {urls.map((url, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label={`Social link ${i + 1}`}
            type="url"
            placeholder="https://www.linkedin.com/company/example"
            className="flex-1"
            value={url}
            onChange={(e) => onChange(urls.map((u, j) => (j === i ? e.target.value : u)))}
          />
          <IconButton
            label={`Remove social link ${i + 1}`}
            variant="quiet"
            size="sm"
            onClick={() => onChange(urls.filter((_, j) => j !== i))}
          >
            <X />
          </IconButton>
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {urls.length < 6 && (
        <Button
          variant="quiet"
          size="sm"
          leftIcon={<Plus />}
          className="self-start"
          onClick={() => onChange([...urls, ''])}
        >
          Add a link
        </Button>
      )}
    </div>
  );
}
