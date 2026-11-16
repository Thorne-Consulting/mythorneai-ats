'use client';

import { BlockquoteRules, HeadingRules, HorizontalRuleRules } from '@platejs/basic-nodes';
import {
  BlockquotePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  HorizontalRulePlugin,
} from '@platejs/basic-nodes/react';
import { CodeBlockRules } from '@platejs/code-block';
import { CodeBlockPlugin, CodeLinePlugin } from '@platejs/code-block/react';
import { KEYS } from 'platejs';
import { ParagraphPlugin, createPlatePlugin } from 'platejs/react';

import { BlockquoteElement } from '@/components/plate/ui/blockquote-node';
import { CodeBlockElement, CodeLineElement } from '@/components/plate/ui/code-block-node';
import {
  H1Element,
  H2Element,
  H3Element,
  H4Element,
  H5Element,
  H6Element,
} from '@/components/plate/ui/heading-node';
import { HrElement } from '@/components/plate/ui/hr-node';
import { ParagraphElement } from '@/components/plate/ui/paragraph-node';

export const BasicBlocksKit = [
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin.configure({
    inputRules: [HeadingRules.markdown()],
    node: {
      component: H1Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+1' } },
  }),
  H2Plugin.configure({
    inputRules: [HeadingRules.markdown()],
    node: {
      component: H2Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+2' } },
  }),
  H3Plugin.configure({
    inputRules: [HeadingRules.markdown()],
    node: {
      component: H3Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+3' } },
  }),
  H4Plugin.configure({
    inputRules: [HeadingRules.markdown()],
    node: {
      component: H4Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+4' } },
  }),
  H5Plugin.configure({
    inputRules: [HeadingRules.markdown()],
    node: {
      component: H5Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+5' } },
  }),
  H6Plugin.configure({
    inputRules: [HeadingRules.markdown()],
    node: {
      component: H6Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
    shortcuts: { toggle: { keys: 'mod+alt+6' } },
  }),
  BlockquotePlugin.configure({
    inputRules: [BlockquoteRules.markdown()],
    node: { component: BlockquoteElement },
    shortcuts: { toggle: { keys: 'mod+shift+period' } },
  }),
  HorizontalRulePlugin.configure({
    inputRules: [
      HorizontalRuleRules.markdown({ variant: '-' }),
      HorizontalRuleRules.markdown({ variant: '_' }),
    ],
    node: {
      component: HrElement,
    },
  }),

  // ``` on a new line (or "/" then Code block) starts one. Enter adds a line; Enter on an empty
  // last line leaves the block. Tab indents inside it.
  CodeBlockPlugin.configure({
    inputRules: [CodeBlockRules.markdown({ on: 'match' })],
    node: { component: CodeBlockElement },
    shortcuts: { toggle: { keys: 'mod+alt+8' } },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  createPlatePlugin({ key: 'code_block_exit' }).overrideEditor(
    ({ editor, tf: { insertBreak } }) => ({
      transforms: {
        insertBreak() {
          const line = editor.api.above({ match: { type: editor.getType(KEYS.codeLine) } });
          const block = editor.api.above({ match: { type: editor.getType(KEYS.codeBlock) } });
          const last = block && line && line[1].at(-1) === block[0].children.length - 1;
          // A new line copies the indent above, so a line of only spaces counts as empty.
          const empty = line && !editor.api.string(line[1]).trim();
          if (!block || !line || !last || block[0].children.length < 2 || !empty)
            return insertBreak();
          const after = [...block[1].slice(0, -1), block[1].at(-1)! + 1];
          editor.tf.withoutNormalizing(() => {
            editor.tf.removeNodes({ at: line[1] });
            editor.tf.insertNodes(
              { type: editor.getType(KEYS.p), children: [{ text: '' }] },
              { at: after, select: true },
            );
          });
        },
      },
    }),
  ),
];
