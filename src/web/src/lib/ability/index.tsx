'use client';

import { useMemo, type ReactNode } from 'react';
import {
  AbilityProvider as CaslAbilityProvider,
  Can as CaslCan,
  useAbility as useCaslAbility,
} from '@casl/react';
import { abilityFor, type AbilityRule, type AppAbility } from './rules';

export * from './rules';

/** Gives the app one ability, built from the rules the server sent with the signed-in user. */
export function AbilityProvider({
  rules,
  children,
}: {
  rules: AbilityRule[];
  children: ReactNode;
}) {
  const ability = useMemo(() => abilityFor(rules), [rules]);
  return <CaslAbilityProvider value={ability}>{children}</CaslAbilityProvider>;
}

/** `const ability = useAbility(); ability.can('create', 'Job')`. */
export const useAbility = () => useCaslAbility<AppAbility>();

/** `<Can I="update" this={asJob(job)}>…</Can>` or `<Can I="create" a="Job">…</Can>`. */
export const Can = CaslCan as typeof CaslCan<AppAbility>;
