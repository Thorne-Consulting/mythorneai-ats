// Run: node src/components/rich-text/RichText.check.mjs
// Renders stored Markdown through RichText and checks the HTML, then round-trips Markdown through
// the same plugins the editors use.
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const src = fileURLToPath(new URL('../../', import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { '@': src }, jsx: { runtime: 'automatic' } });
const { renderToStaticMarkup } = await import('react-dom/server');
const { createElement } = await import('react');
const { RichText } = await jiti.import('./RichText.tsx');

const md = `# Senior designer

Intro with **bold**, _italic_, <u>under</u> and \`code\`.

## What you will do

- Lead research
- Ship designs
  - Nested point

1. First
2. Second

- [ ] Open task
- [x] Done task

> A quote

---

| Skill | Level |
| ----- | ----- |
| Figma | High  |

Hi {{firstName}}, ask [Avery Admin](mention:avery%40example.test) about {{ jobTitle }}.

[Site](https://example.com) [Mail](mailto:jobs@example.com) [Bad](javascript:alert(1))

\`\`\`
const a = 1;
\`\`\`

\`\`\`python
print("hi")
\`\`\`

![Our team at the summer offsite](/public/media/0123456789abcdef0123456789abcdef.png?size=1200x800)

![](/public/media/fedcba9876543210fedcba9876543210.jpg)

![Bad](javascript:alert(1))
`;

const html = renderToStaticMarkup(createElement(RichText, { markdown: md }));
const has = (re, what) => assert.match(html, re, `missing ${what}`);

has(/<h1[^>]*>.*Senior designer/, 'h1');
has(/<h2[^>]*class="[^"]*text-xl/, 'h2 on the token scale');
has(/<strong[^>]*>.*bold/, 'bold');
has(/<em[^>]*>.*italic/, 'italic');
has(/<code[^>]*>.*code/, 'inline code');
has(/<ul[^>]*style="list-style-type:disc/, 'bulleted list');
has(/<ol[^>]*start="1"/, 'numbered list');
has(/margin-left:48px/, 'nested indent');
has(/line-through/, 'checked task');
has(/<blockquote/, 'quote');
has(/<hr/, 'rule');
has(/<table[\s\S]*Figma/, 'table');
has(/<pre[^>]*>[\s\S]*const a = 1;/, 'code block');
has(/>Python<\/div><pre/, 'code block language label');
has(
  /<img src="\/public\/media\/0123456789abcdef0123456789abcdef.png\?size=1200x800" alt="Our team at the summer offsite" width="1200" height="800"/,
  'picture with its description and size',
);
has(
  /<img src="\/public\/media\/fedcba9876543210fedcba9876543210.jpg" alt=""/,
  'picture without a size',
);
assert.doesNotMatch(html, /src="javascript/, 'javascript: picture must not render');
has(/<a[^>]*href="https:\/\/example.com\/"[^>]*/, 'https link');
has(/href="mailto:jobs@example.com"/, 'mailto link');
assert.doesNotMatch(html, /href="javascript/, 'javascript: link must not render as a link');
has(/<u[^>]*>.*under/, 'underline');
assert.match(html, /target="_blank"/);
has(/>First name</, 'detail chip in words');
has(/>@Avery Admin</, 'person chip');
assert.match(html, /rel="noopener noreferrer"/);
assert.doesNotMatch(html, /data-block-id/, 'random ids would break hydration');
assert.equal(
  html,
  renderToStaticMarkup(createElement(RichText, { markdown: md })),
  'stable output',
);
assert.equal(
  renderToStaticMarkup(createElement(RichText, { markdown: '  ', empty: 'None' })),
  'None',
);

// Round trip with the plugins the editors share.
const { createSlateEditor } = await import('platejs');
const { deserializeMd, serializeMd } = await import('@platejs/markdown');
const { MarkdownKit } = await jiti.import('../plate/editor/plugins/markdown-kit.tsx');
const { BaseBasicBlocksKit } = await jiti.import(
  '../plate/editor/plugins/basic-blocks-base-kit.tsx',
);
const { BaseBasicMarksKit } = await jiti.import('../plate/editor/plugins/basic-marks-base-kit.tsx');
const { BaseListKit } = await jiti.import('../plate/editor/plugins/list-base-kit.tsx');
const { BaseLinkKit } = await jiti.import('../plate/editor/plugins/link-base-kit.tsx');
const { BaseTableKit } = await jiti.import('../plate/editor/plugins/table-base-kit.tsx');
const { BaseMentionPlugin } = await import('@platejs/mention');
const { BaseImageKit } = await jiti.import('../plate/ui/image-node-static.tsx');
const editor = createSlateEditor({
  plugins: [
    ...BaseBasicBlocksKit,
    ...BaseBasicMarksKit,
    ...BaseListKit,
    ...BaseLinkKit,
    ...BaseTableKit,
    ...BaseImageKit,
    BaseMentionPlugin,
    ...MarkdownKit,
  ],
});
const once = serializeMd(editor, { value: deserializeMd(editor, md) });
const twice = serializeMd(editor, { value: deserializeMd(editor, once) });
assert.equal(twice, once, 'markdown round trip is stable');
for (const bit of [
  '- Lead research',
  '  - Nested point',
  '1. First',
  '2. Second',
  '- [ ] Open task',
  '- [x] Done task',
  '[Site](https://example.com)',
  '| Figma',
  '# Senior designer',
  '**bold**',
  '<u>under</u>',
  'Hi {{firstName}}, ask [Avery Admin](mention:avery%40example.test) about {{jobTitle}}.',
  '```python\nprint("hi")\n```',
  '![Our team at the summer offsite](/public/media/0123456789abcdef0123456789abcdef.png?size=1200x800)',
  '![](/public/media/fedcba9876543210fedcba9876543210.jpg)',
]) {
  assert.ok(once.includes(bit), `round trip lost "${bit}":\n${once}`);
}
// Saving waits for pictures to be described and uploaded.
const { imageProblem } = await jiti.import('../editor/images.ts');
assert.equal(imageProblem(once), 'Describe the picture before you save.');
assert.equal(imageProblem('![A chart](/public/media/a.png)'), null);
assert.equal(
  imageProblem('![A chart](blob:http://x/1)'),
  'Wait for the picture to finish uploading.',
);
assert.equal(imageProblem('![](a.png) ![ ](b.png)'), 'Describe all 2 pictures before you save.');
console.log('rich text ok');
