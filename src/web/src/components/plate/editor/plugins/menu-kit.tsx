'use client';

import { withTriggerCombobox } from '@platejs/combobox';
import { SlashInputPlugin, SlashPlugin } from '@platejs/slash-command/react';
import { type SlateEditor, createSlatePlugin, createTSlatePlugin } from 'platejs';
import { toPlatePlugin } from 'platejs/react';

import { SlashInputElement, TemplateInputElement } from '@/components/plate/ui/menu-node';

/** Only on an empty paragraph: anywhere else "/" and "#" are just characters. */
const onEmptyLine = (editor: SlateEditor) => {
  const entry = editor.api.block();
  return !!entry && entry[0].type === 'p' && editor.api.isEmpty(entry[0]);
};

const TemplateInputPlugin = toPlatePlugin(
  createSlatePlugin({
    key: 'template_input',
    editOnly: true,
    node: { isElement: true, isInline: true, isVoid: true },
  }),
).withComponent(TemplateInputElement);

// A twin of Plate's slash plugin with "#" as the trigger.
const TemplatePlugin = toPlatePlugin(
  createTSlatePlugin({
    key: 'template_command',
    editOnly: true,
    options: {
      trigger: '#',
      triggerPreviousCharPattern: /^$/,
      triggerQuery: onEmptyLine,
      createComboboxInput: () => ({ children: [{ text: '' }], type: 'template_input' }),
    },
    plugins: [TemplateInputPlugin],
  }).overrideEditor(withTriggerCombobox),
);

export const SlashKit = [
  SlashPlugin.configure({ options: { triggerQuery: onEmptyLine } }),
  SlashInputPlugin.withComponent(SlashInputElement),
];

export const TemplateKit = [TemplatePlugin];
