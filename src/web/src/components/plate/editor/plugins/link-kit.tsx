'use client';

import { LinkRules } from '@platejs/link';
import { LinkPlugin } from '@platejs/link/react';

import { LinkElement } from '@/components/plate/ui/link-node';
import { LinkFloatingToolbar } from '@/components/plate/ui/link-toolbar';

import { linkOptions } from './link-base-kit';

export const LinkKit = [
  LinkPlugin.configure({
    options: linkOptions,
    inputRules: [
      // Paste a web address over selected text: that text becomes the link.
      LinkRules.autolink({ variant: 'paste' }),
      // A typed web address becomes a link after a space or Enter.
      LinkRules.autolink({ variant: 'space' }),
      LinkRules.autolink({ variant: 'break' }),
      // [text](https://…) typed out.
      LinkRules.markdown(),
    ],
    render: { node: LinkElement, afterEditable: () => <LinkFloatingToolbar /> },
  }),
];
