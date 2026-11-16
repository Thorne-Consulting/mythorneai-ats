'use client';

import { SearchSelect, Select } from '@/components/ui';
import { isReferral, sourceOptions, useSources, useTeammates } from './sources-data';

/**
 * The source picker from the managed list, plus "Referred by" (a teammate) when the source is a
 * referral. `keep` is the source the person has now, offered even if it was turned off.
 */
export function SourceFields({
  source,
  referrerId,
  onChange,
  error,
  keep,
  enabled = true,
}: {
  source: string | null;
  referrerId: string | null;
  onChange: (value: { source: string | null; referrerId: string | null }) => void;
  error?: string;
  keep?: string | null;
  enabled?: boolean;
}) {
  const sources = useSources(enabled);
  const referral = isReferral(sources.data, source);
  const teammates = useTeammates(enabled && referral);
  return (
    <>
      <Select
        label="Source"
        required
        placeholder="Where they came from"
        data={sourceOptions(sources.data, keep)}
        value={source}
        onChange={(value) =>
          onChange({
            source: value,
            referrerId: isReferral(sources.data, value) ? referrerId : null,
          })
        }
        error={error}
      />
      {referral && (
        <SearchSelect
          label="Referred by"
          placeholder="Search your team"
          value={referrerId}
          onChange={(value) => onChange({ source, referrerId: value })}
          data={(teammates.data ?? []).map((p) => ({
            value: p.id,
            label: p.displayName,
            keywords: `${p.displayName} ${p.email}`,
          }))}
          nothingFound="No one in your workspace matches"
        />
      )}
    </>
  );
}
