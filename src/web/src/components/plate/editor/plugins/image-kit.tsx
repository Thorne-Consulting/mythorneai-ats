'use client';

import { ImagePlugin } from '@platejs/media/react';
import { createPlatePlugin } from 'platejs/react';

import { ImageElement, insertImageFile } from '@/components/plate/ui/image-node';

/** Files from a paste or a drop. A copied picture also carries HTML, so text decides, not HTML. */
const pastedFiles = (data: DataTransfer) =>
  data.getData('text/plain') ? [] : [...(data.files ?? [])];

/**
 * Pictures: the toolbar button, "/" then Picture, paste or drag and drop. Each upload goes to
 * `/api/media/images` and is stored as `![description](/public/media/….png?size=800x600)`. Plate's own
 * paste handling (base64 pictures, image web addresses) is off: every picture is uploaded.
 */
export const ImageKit = [
  ImagePlugin.configure({
    options: { disableUploadInsert: true, disableEmbedInsert: true },
  }).withComponent(ImageElement),
  createPlatePlugin({
    key: 'image_upload',
    handlers: {
      onDrop: ({ editor, event }) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (files.length === 0) return false;
        event.preventDefault();
        const range = editor.api.findEventRange(event);
        if (range) editor.tf.select(range);
        files.forEach((file) => insertImageFile(editor, file));
        return true;
      },
    },
  }).overrideEditor(({ editor, tf: { insertData } }) => ({
    transforms: {
      insertData(data) {
        const files = pastedFiles(data);
        if (files.length === 0) return insertData(data);
        files.forEach((file) => insertImageFile(editor, file));
      },
    },
  })),
];
