'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { IconButton } from './button';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={copied ? 'Copied' : label}
      size="sm"
      variant="quiet"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="text-tone-green-dot" /> : <Copy />}
    </IconButton>
  );
}
