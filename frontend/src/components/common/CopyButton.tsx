import { useState } from 'react';
import { Button } from 'react-bootstrap';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context); the value stays selectable.
    }
  };
  return (
    <Button
      variant="link"
      size="sm"
      className="p-0 ms-1 lh-1 text-body-secondary"
      onClick={copy}
      aria-label={`${label} ${value}`}
    >
      <i className={`bi ${copied ? 'bi-check2 text-success' : 'bi-copy'}`} aria-hidden="true" />
    </Button>
  );
}
