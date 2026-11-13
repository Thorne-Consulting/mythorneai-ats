'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Paperclip, UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, type ButtonProps } from './button';

/** A button that opens the file picker. */
export function FileButton({
  onFile,
  accept,
  children,
  ...props
}: Omit<ButtonProps, 'onClick'> & {
  onFile: (file: File) => void;
  accept?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = '';
        }}
      />
      <Button {...props} onClick={() => ref.current?.click()}>
        {children}
      </Button>
    </>
  );
}

/** Drag-and-drop area with a browse fallback. Shows the chosen file. */
export function FileDrop({
  file,
  onFile,
  accept,
  hint = 'PDF or Word document, up to 10 MB',
  label = 'Drag a file here, or click to choose one',
  className,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  accept?: string;
  hint?: ReactNode;
  label?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  if (file)
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3',
          className,
        )}
      >
        <Paperclip className="size-4 text-fg-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-fg">{file.name}</p>
          <p className="text-xs text-fg-subtle">{(file.size / 1024).toFixed(0)} KB</p>
        </div>
        <button
          type="button"
          onClick={() => onFile(null)}
          aria-label="Remove file"
          className="rounded-sm p-1 text-fg-subtle hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-accent/50',
        over && 'border-primary bg-accent',
        className,
      )}
    >
      <UploadCloud className="size-7 text-tone-blue-dot" strokeWidth={1.75} aria-hidden />
      <span className="text-base font-medium text-fg">{label}</span>
      <span className="text-xs text-fg-subtle">{hint}</span>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = '';
        }}
      />
    </button>
  );
}
