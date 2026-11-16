/** "Notice period (weeks)" → "notice-period-weeks", unique among the other keys. */
export function keyFromLabel(label: string, taken: string[]) {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'field';
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`;
  return key;
}
