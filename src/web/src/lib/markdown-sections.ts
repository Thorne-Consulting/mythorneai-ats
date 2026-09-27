export function markdownSections(markdown: string) {
  const sections: Record<string, string> = {};
  const matches = [...markdown.matchAll(/^#{1,2}\s+(.+?)\s*$/gm)];
  for (const [index, match] of matches.entries()) {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    sections[match[1].trim().toLowerCase()] = markdown.slice(start, end).trim();
  }
  return sections;
}
