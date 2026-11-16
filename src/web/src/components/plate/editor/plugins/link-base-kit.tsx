import { BaseLinkPlugin } from '@platejs/link';

import { LinkElementStatic } from '@/components/plate/ui/link-node-static';

/** Only web and email links. Anything else (javascript:, data:) renders as plain text. */
export const linkOptions = {
  allowedSchemes: ['http', 'https', 'mailto'],
  defaultLinkAttributes: { target: '_blank', rel: 'noopener noreferrer' },
};

export const BaseLinkKit = [
  BaseLinkPlugin.configure({ options: linkOptions }).withComponent(LinkElementStatic),
];
