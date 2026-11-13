/** Up to three distinct ids from `?ids=a,b,c`. */
export function compareIds(raw: string | undefined) {
  return [
    ...new Set(
      (raw ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ].slice(0, 3);
}

/**
 * Which skills the compared people share, by lower-cased name: 'all' when everyone has it,
 * 'some' when more than one does. Skills only one person has are left out.
 */
export function skillOverlap(lists: string[][]) {
  const counts = new Map<string, number>();
  for (const list of lists)
    for (const skill of new Set(list.map((s) => s.toLowerCase())))
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
  const result = new Map<string, 'all' | 'some'>();
  for (const [skill, count] of counts)
    if (count > 1) result.set(skill, count === lists.length ? 'all' : 'some');
  return result;
}
