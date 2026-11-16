'use client';

import {
  indentList,
  outdentList,
  BulletedListRules,
  OrderedListRules,
  TaskListRules,
} from '@platejs/list';
import { IndentPlugin } from '@platejs/indent/react';
import { ListPlugin } from '@platejs/list/react';
import { KEYS } from 'platejs';
import { createPlatePlugin } from 'platejs/react';

import { BlockList } from '@/components/plate/ui/block-list';

import { listTargets } from './list-base-kit';

/**
 * Tab and Shift+Tab nest list items. Anywhere else Tab keeps its usual job: next table cell, or
 * moving focus out of the editor. Plate's indent plugin would otherwise indent plain paragraphs,
 * which Markdown cannot store.
 */
const ListTabPlugin = createPlatePlugin({ key: 'list_tab' }).overrideEditor(
  ({ editor, tf: { tab } }) => ({
    transforms: {
      tab(options) {
        const entry = editor.api.block();
        if (entry?.[0].listStyleType) {
          if (options.reverse) outdentList(editor);
          else indentList(editor);
          return true;
        }
        if (editor.api.some({ match: { type: [KEYS.td, KEYS.th] } })) return tab(options);
        return false;
      },
    },
  }),
);

/** Goes before the table plugin, so in a table cell Tab moves cells instead of indenting. */
export const IndentKit = [IndentPlugin.configure({ inject: { targetPlugins: listTargets } })];

/** Goes after the table plugin, so it sees Tab first (see `ListTabPlugin`). */
export const ListKit = [
  ListPlugin.configure({
    inject: { targetPlugins: listTargets },
    inputRules: [
      BulletedListRules.markdown({ variant: '-' }),
      BulletedListRules.markdown({ variant: '*' }),
      OrderedListRules.markdown({ variant: '.' }),
      OrderedListRules.markdown({ variant: ')' }),
      TaskListRules.markdown(),
      TaskListRules.markdown({ checked: true }),
    ],
    render: { belowNodes: BlockList },
  }),
  ListTabPlugin,
];
