'use client';

import { useCallback, useState } from 'react';

type Props = {
  label: string;
  value: string;
  monospace?: boolean;
};

export function CopyTextButton({ label, value, monospace = true }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Skopiuj ręcznie (Ctrl+C):', value);
    }
  }, [value]);

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <code
          style={{
            flex: '1 1 200px',
            fontSize: monospace ? '0.72rem' : '0.85rem',
            wordBreak: 'break-all',
            background: '#0f172a',
            padding: '0.5rem 0.65rem',
            borderRadius: 6,
            border: '1px solid #334155',
          }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => void onCopy()}
          style={{
            padding: '0.45rem 0.9rem',
            background: copied ? '#166534' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? 'Skopiowano ✓' : 'Kopiuj'}
        </button>
      </div>
    </div>
  );
}
