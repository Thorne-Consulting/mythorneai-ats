'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { SegmentedControl } from '@/components/ui';
import { cn } from '@/lib/cn';

const SIZES = {
  desktop: { width: 1024, height: 720 },
  phone: { width: 390, height: 760 },
};

/**
 * A real page in a frame at desktop or phone width, scaled down to fit its column, so pages that
 * change layout on small screens show the phone layout for real. `toolbar` sits left of the
 * Desktop / Phone switch.
 */
export function PreviewFrame({
  src,
  title,
  toolbar,
  frameRef,
  onLoad,
}: {
  src: string;
  title: string;
  toolbar?: ReactNode;
  frameRef?: RefObject<HTMLIFrameElement | null>;
  onLoad?: () => void;
}) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setRoom(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const size = SIZES[device];
  const scale = room ? Math.min(1, room / size.width) : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {toolbar ?? <span />}
        <SegmentedControl
          size="sm"
          aria-label="Screen size"
          value={device}
          onValueChange={(v) => setDevice(v as 'desktop' | 'phone')}
          items={[
            { value: 'desktop', label: 'Desktop', icon: <Monitor /> },
            { value: 'phone', label: 'Phone', icon: <Smartphone /> },
          ]}
        />
      </div>
      <div ref={box} className="w-full">
        <div
          className={cn(
            'mx-auto overflow-hidden bg-background shadow-card',
            device === 'phone'
              ? 'rounded-[28px] ring-4 ring-fg/80'
              : 'rounded-xl ring-1 ring-border',
          )}
          // A computed size: the frame is drawn at its real width, then scaled to fit.
          style={{ width: size.width * scale, height: size.height * scale }}
        >
          {scale > 0 && (
            <iframe
              ref={frameRef}
              key={`${src}-${device}`}
              src={src}
              title={`${title}, ${device === 'phone' ? 'phone' : 'desktop'} size`}
              onLoad={onLoad}
              className="origin-top-left border-0"
              style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
