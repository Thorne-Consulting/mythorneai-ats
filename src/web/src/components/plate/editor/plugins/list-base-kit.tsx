import { BaseIndentPlugin } from '@platejs/indent';
import { BaseListPlugin } from '@platejs/list';
import { KEYS } from 'platejs';

import { BlockListStatic } from '@/components/plate/ui/block-list-static';

export const listTargets = [...KEYS.heading, KEYS.p, KEYS.blockquote, KEYS.codeBlock];

export const BaseListKit = [
  BaseIndentPlugin.configure({ inject: { targetPlugins: listTargets } }),
  BaseListPlugin.configure({
    inject: { targetPlugins: listTargets },
    render: { belowNodes: BlockListStatic },
  }),
];
