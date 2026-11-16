// A one-line field (an email subject) as plain text with detail chips. No Markdown, so a "#" or
// "*" in a subject stays as typed. Pure, so single-line.check.mjs runs it with node.

type Chip = { type: 'mention'; trigger: '{'; key: string; value: string; children: [{ text: '' }] };
type Text = { text: string };
type Line = { type: 'p'; children: (Chip | Text)[] };

/** "Your {{jobTitle}} interview" to one paragraph of text and chip nodes. */
export function lineToValue(line: string): Line[] {
  const parts = line.replace(/[\r\n]+/g, ' ').split(/\{\{\s*([A-Za-z][\w.]*)\s*\}\}/);
  const children: (Chip | Text)[] = [];
  parts.forEach((part, index) => {
    if (index % 2 === 0) children.push({ text: part });
    else
      children.push({
        type: 'mention',
        trigger: '{',
        key: part,
        value: part,
        children: [{ text: '' }],
      });
  });
  return [{ type: 'p', children }];
}

type AnyNode = {
  text?: string;
  type?: string;
  trigger?: string;
  key?: string;
  value?: string;
  children?: AnyNode[];
};

/** Back to one line: chips as {{key}}, people as their name, blocks joined by a space. */
export function valueToLine(nodes: AnyNode[]): string {
  const walk = (node: AnyNode): string =>
    typeof node.text === 'string'
      ? node.text
      : node.type === 'mention'
        ? node.trigger === '{'
          ? `{{${node.key ?? node.value}}}`
          : (node.value ?? '')
        : (node.children ?? []).map(walk).join('');
  return nodes
    .map(walk)
    .join(' ')
    .replace(/[\r\n]+/g, ' ');
}
