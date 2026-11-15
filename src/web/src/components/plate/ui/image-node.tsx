'use client';

import * as React from 'react';

import { ImageIcon, Loader2, X } from 'lucide-react';
import {
  type PlateEditor,
  type PlateElementProps,
  PlateElement,
  useEditorRef,
  useFocused,
  useReadOnly,
  useSelected,
} from 'platejs/react';
import { KEYS } from 'platejs';

import { api } from '@/api';
import { toast } from '@/components/ui';
import { cn } from '@/lib/cn';

import { type ImageNode, imageAlt, imageClass, imageSize, safeImageUrl } from './image-node-static';
import { ToolbarButton } from './toolbar';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

async function pixelSize(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * Puts a picture in at the cursor (an empty line becomes the picture) and uploads it. It shows
 * at once from the file, dimmed, and the description field takes focus; when the upload is done
 * the picture points at its public address, with its size in the address.
 */
export async function insertImageFile(editor: PlateEditor, file: File) {
  if (!IMAGE_TYPES.includes(file.type)) {
    toast.error('We can’t add that file', 'Use a PNG, JPEG, GIF or WebP picture.');
    return;
  }
  if (file.size > MAX_BYTES) {
    toast.error('That picture is too big', 'Pictures can be up to 5 MB. Try a smaller one.');
    return;
  }
  const preview = URL.createObjectURL(file);
  const uploadId = Math.random().toString(36).slice(2);
  const node = {
    type: editor.getType(KEYS.img),
    url: preview,
    uploading: true,
    uploadId,
    caption: [{ text: '' }],
    children: [{ text: '' }],
  };
  const block = editor.api.block();
  if (!block) editor.tf.insertNodes(node, { at: [editor.children.length] });
  else if (block[0].type === editor.getType(KEYS.p) && editor.api.isEmpty(block[0]))
    // The empty line moves down under the picture, so typing carries on there.
    editor.tf.insertNodes(node, { at: block[1] });
  else editor.tf.insertNodes(node, { nextBlock: true });
  // Ask for the description straight away, while the file uploads.
  setTimeout(() => document.getElementById(`image-alt-${uploadId}`)?.focus(), 50);

  const find = () =>
    editor.api.node({ at: [], match: (n) => (n as { uploadId?: string }).uploadId === uploadId });
  const size = await pixelSize(file);
  try {
    const { url } = await api.upload<{ url: string }>('/api/media/images', file);
    const entry = find();
    if (!entry) return;
    editor.tf.setNodes({ url: size ? `${url}?size=${size.w}x${size.h}` : url }, { at: entry[1] });
    editor.tf.unsetNodes(['uploading', 'uploadId'], { at: entry[1] });
  } catch (error) {
    const entry = find();
    if (entry) editor.tf.removeNodes({ at: entry[1] });
    toast.error('Could not add the picture', (error as Error).message);
  } finally {
    URL.revokeObjectURL(preview);
  }
}

/** Opens the file picker. Used by the toolbar button and the "/" menu. */
export function pickImage(editor: PlateEditor) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = IMAGE_TYPES.join(',');
  input.multiple = true;
  input.onchange = () => [...(input.files ?? [])].forEach((file) => insertImageFile(editor, file));
  input.click();
}

export function ImageToolbarButton() {
  const editor = useEditorRef();
  if (!editor.plugins[KEYS.img]) return null;
  return (
    <ToolbarButton
      tooltip="Picture (or paste or drop one)"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => pickImage(editor)}
    >
      <ImageIcon />
    </ToolbarButton>
  );
}

/**
 * A picture in the editor, with its description right under it. The description is required:
 * the field is red until it has one, and saving is refused without it.
 */
export function ImageElement(props: PlateElementProps<ImageNode>) {
  const { editor, element } = props;
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const id = React.useId();
  // A fresh upload is found by its upload id, so its description field can take focus.
  const inputId = element.uploadId ? `image-alt-${element.uploadId}` : id;
  const alt = imageAlt(element);
  const missing = !alt.trim();
  const at = () => editor.api.findPath(element);

  return (
    <PlateElement {...props} className="my-4">
      <figure contentEditable={false} className="group/image relative w-full max-w-full">
        <div className="relative w-fit max-w-full">
          {safeImageUrl(element.url) ? (
            // eslint-disable-next-line @next/next/no-img-element -- any size, any host.
            <img
              src={element.url}
              alt={alt}
              {...imageSize(element.url)}
              draggable={false}
              className={cn(
                imageClass,
                selected && focused && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
                element.uploading && 'opacity-60',
              )}
            />
          ) : (
            <span className="flex h-24 w-64 items-center justify-center rounded-md bg-muted text-sm text-fg-subtle">
              This picture can’t be shown
            </span>
          )}
          {element.uploading && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-popover px-2.5 py-1 text-xs font-medium text-fg shadow-pop">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Uploading
            </span>
          )}
          {!readOnly && (
            <button
              type="button"
              aria-label="Remove picture"
              onClick={() => {
                const path = at();
                if (path) editor.tf.removeNodes({ at: path });
                editor.tf.focus();
              }}
              className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md bg-popover text-fg-muted opacity-0 shadow-pop transition-opacity group-hover/image:opacity-100 hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {!readOnly && (
          <figcaption className="mt-2 max-w-md">
            <label htmlFor={inputId} className="sr-only">
              Picture description
            </label>
            <input
              id={inputId}
              value={alt}
              aria-invalid={missing || undefined}
              aria-describedby={missing ? `${id}-hint` : undefined}
              placeholder="Describe the picture"
              onChange={(event) => {
                const path = at();
                if (path)
                  editor.tf.setNodes({ caption: [{ text: event.target.value }] }, { at: path });
              }}
              onKeyDown={(event) => {
                // Enter goes back to writing, under the picture.
                if (event.key !== 'Enter') return;
                event.preventDefault();
                const path = at();
                if (!path) return;
                const after = [...path.slice(0, -1), path[path.length - 1] + 1];
                if (editor.api.node(after)) editor.tf.select(editor.api.start(after)!);
                else
                  editor.tf.insertNodes(
                    { type: editor.getType(KEYS.p), children: [{ text: '' }] },
                    { at: after, select: true },
                  );
                editor.tf.focus();
              }}
              className={cn(
                'h-8 w-full rounded-md border bg-card px-2.5 text-sm text-fg transition-colors placeholder:text-fg-subtle focus:border-primary focus:outline-none',
                missing ? 'border-destructive' : 'border-input',
              )}
            />
            {missing && (
              <p id={`${id}-hint`} className="mt-1 text-xs text-destructive">
                Required. Say what the picture shows, for people who can’t see it.
              </p>
            )}
          </figcaption>
        )}
      </figure>
      {props.children}
    </PlateElement>
  );
}
