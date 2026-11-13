'use client';

import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useLocalStorageState } from '@/lib/hooks';

/**
 * Two panes with a draggable divider (list + preview, inbox + thread). The side pane can be closed;
 * its width is remembered per `storageKey`. Below `lg` only the main pane shows unless `side` is
 * the thing being viewed — the page decides that with `sideOpen`.
 */
export function SplitView({
  main,
  side,
  sideOpen,
  storageKey,
  defaultWidth = 380,
  min = 300,
  max = 640,
  className,
}: {
  main: ReactNode;
  side: ReactNode;
  sideOpen: boolean;
  storageKey: string;
  defaultWidth?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [width, setWidth] = useLocalStorageState(`ats-split:${storageKey}`, defaultWidth);
  const box = useRef<HTMLDivElement>(null);
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const right = box.current!.getBoundingClientRect().right;
    const move = (ev: PointerEvent) => setWidth(Math.min(max, Math.max(min, right - ev.clientX)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div ref={box} className={cn('flex min-w-0 items-start gap-0', className)}>
      <div className="min-w-0 flex-1">{main}</div>
      {sideOpen && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            tabIndex={0}
            onPointerDown={start}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setWidth((w) => Math.min(max, w + 24));
              if (e.key === 'ArrowRight') setWidth((w) => Math.max(min, w - 24));
            }}
            className="group sticky top-[101px] hidden h-[60vh] w-4 shrink-0 cursor-col-resize items-center justify-center lg:flex"
          >
            <span className="h-12 w-1 rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
          </div>
          <aside className="hidden shrink-0 lg:sticky lg:top-[101px] lg:block" style={{ width }}>
            {side}
          </aside>
        </>
      )}
    </div>
  );
}
