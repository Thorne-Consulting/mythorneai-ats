import { MarkdownPlugin } from '@platejs/markdown';
import remarkGfm from 'remark-gfm';
import type { Plugin } from 'unified';

type MdNode = { type: string; value?: string; children?: MdNode[]; name?: string };

/**
 * Plate writes underline as `<u>text</u>`, which plain Markdown reads as two loose HTML tags.
 * This pairs them back up on read and writes them out on save, so underline survives a round trip.
 * Without remark-mdx, which would choke on a stray `<` or `{{` in ordinary text.
 */
export const remarkUnderline: Plugin = function () {
  const data = this.data();
  (data.toMarkdownExtensions ??= []).push({
    handlers: {
      mdxJsxTextElement: (node, _, state, info) =>
        `<${node.name}>${state.containerPhrasing(node, { ...info, before: '>', after: '<' })}</${node.name}>`,
    },
  });
  const walk = (node: MdNode) => {
    const kids = node.children;
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].type !== 'html' || kids[i].value !== '<u>') continue;
      const end = kids.findIndex((n, j) => j > i && n.type === 'html' && n.value === '</u>');
      if (end < 0) continue;
      const inner = kids.slice(i + 1, end);
      kids.splice(i, end - i + 1, { type: 'mdxJsxTextElement', name: 'u', children: inner });
    }
    kids.forEach(walk);
  };
  return (tree) => walk(tree as MdNode);
};

/**
 * Chips (see `chip-kit.tsx`): `[Name](mention:id)` is a person, `{{key}}` a detail. Read into
 * mention nodes here, written back by the `mention` rule below.
 */
export const remarkChips: Plugin = function () {
  const walk = (node: MdNode & { url?: string }) => {
    const kids = node.children;
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) {
      const kid = kids[i] as MdNode & { url?: string };
      if (kid.type === 'link' && kid.url?.startsWith('mention:')) {
        const username = decodeURIComponent(kid.url.slice(8));
        const displayText = kid.children?.[0]?.value || username;
        kids[i] = { type: 'mention', username, displayText } as MdNode;
        continue;
      }
      if (kid.type === 'text' && kid.value?.includes('{{')) {
        const parts = kid.value.split(/\{\{\s*([A-Za-z][\w.]*)\s*\}\}/);
        if (parts.length === 1) continue;
        const nodes = parts
          .map((part, j) =>
            j % 2
              ? { type: 'mention', username: part, trigger: '{' }
              : { type: 'text', value: part },
          )
          .filter((n) => n.type !== 'text' || (n as MdNode).value) as MdNode[];
        kids.splice(i, 1, ...nodes);
        i += nodes.length - 1;
        continue;
      }
      walk(kid);
    }
  };
  return (tree) => walk(tree as MdNode);
};

type ChipNode = { key?: string; value: string; trigger?: string };
type MdChip = { username: string; displayText?: string; trigger?: string };

const chipRule = {
  deserialize: (node: MdChip) => ({
    type: 'mention',
    children: [{ text: '' }],
    key: node.username,
    value: node.displayText ?? node.username,
    ...(node.trigger === '{' && { trigger: '{' }),
  }),
  serialize: (node: ChipNode) =>
    node.trigger === '{'
      ? { type: 'html', value: `{{${node.key ?? node.value}}}` }
      : {
          type: 'link',
          url: `mention:${encodeURIComponent(node.key ?? node.value)}`,
          children: [{ type: 'text', value: node.value }],
        },
};

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm, remarkUnderline, remarkChips],
      rules: { mention: chipRule } as never,
      // Write "- item" and "---", the way people type them.
      remarkStringifyOptions: { bullet: '-', rule: '-' },
    },
  }),
];
