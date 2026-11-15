'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { ChipItem } from '@/components/plate/editor/plugins/editor-kit';

export interface TemplateDetail {
  key: string;
  label: string;
  example: string;
}

export interface SavedReply {
  id: string;
  name: string;
  category?: string | null;
  subject: string;
  body: string;
  shared: boolean;
  updatedAt: string;
  updatedByName?: string | null;
  canEdit: boolean;
}

export interface AutomaticEmail {
  key: string;
  label: string;
  audience: 'Candidate' | 'Team';
  sentWhen: string;
  subject: string;
  changed: boolean;
  overrides: number;
  updatedAt?: string | null;
  updatedByName?: string | null;
}

export interface TemplateLibrary {
  canEditAutomatic: boolean;
  canShare: boolean;
  details: TemplateDetail[];
  savedReplyDetails: string[];
  saved: SavedReply[];
  automatic: AutomaticEmail[];
}

export interface TemplateRecord {
  id: string;
  kind: 'Automatic' | 'Saved';
  name: string;
  category?: string | null;
  audience?: 'Candidate' | 'Team';
  sentWhen?: string;
  details: string[];
  subject: string;
  body: string;
  defaultSubject?: string;
  defaultBody?: string;
  source?: 'default' | 'organization' | 'job';
  shared?: boolean;
  version: number;
  updatedAt?: string | null;
  updatedByName?: string | null;
  overrides?: { requisitionId: string; title: string; updatedAt: string }[];
  canEdit: boolean;
}

export interface TemplateVersion {
  version: number;
  subject: string;
  body: string;
  action: 'Saved' | 'Restored' | 'Reset';
  editedAt: string;
  editedByName?: string | null;
}

export interface TemplatePreview {
  subject: string;
  html: string;
  missing: { key: string; label: string }[];
}

export const useTemplateLibrary = (enabled = true) =>
  useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<TemplateLibrary>('/api/templates'),
    enabled,
    staleTime: 30_000,
  });

export const useTemplate = (id: string | null, requisitionId?: string | null) =>
  useQuery({
    queryKey: ['template', id, requisitionId ?? null],
    queryFn: () =>
      api.get<TemplateRecord>(
        `/api/templates/${id}${requisitionId ? `?requisitionId=${requisitionId}` : ''}`,
      ),
    enabled: !!id,
  });

export const useTemplateVersions = (id: string, requisitionId: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ['template-versions', id, requisitionId],
    queryFn: () =>
      api.get<TemplateVersion[]>(
        `/api/templates/${id}/versions${requisitionId ? `?requisitionId=${requisitionId}` : ''}`,
      ),
    enabled,
  });

export function useRefreshTemplates() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: ['templates'] });
    client.invalidateQueries({ queryKey: ['template'] });
    client.invalidateQueries({ queryKey: ['template-versions'] });
  };
}

/** Chips for the editor's "{" menu: the details this template may use, with plain labels. */
export function detailChips(library: TemplateDetail[] | undefined, keys: string[]): ChipItem[] {
  return keys.map((key) => ({
    key,
    text: library?.find((d) => d.key === key)?.label ?? key,
  }));
}

/** Rendered with sample details (or a real candidate's), refreshed shortly after each change. */
export function useLivePreview(input: {
  subject: string;
  body: string;
  id?: string;
  applicationId?: string | null;
}) {
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [failed, setFailed] = useState(false);
  const { subject, body, id, applicationId } = input;
  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .post<TemplatePreview>('/api/templates/preview', { subject, body, id, applicationId })
        .then((result) => {
          setPreview(result);
          setFailed(false);
        })
        .catch(() => setFailed(true));
    }, 350);
    return () => clearTimeout(timer);
  }, [subject, body, id, applicationId]);
  return { preview, failed };
}
