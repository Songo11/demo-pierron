'use client';

import { useEffect, useState, type ComponentType } from 'react';

/**
 * Load the heavy ecosystem UI only after mount.
 * Avoids pulling Meteora/ledger into the initial route compile graph as aggressively.
 */
export default function EcosystemPage() {
  const [Screen, setScreen] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('../../components/ecosystem/EcosystemScreen')
      .then((mod) => {
        if (!cancelled) setScreen(() => mod.default);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="pierron-error-inline" style={{ padding: 24 }}>
        Ecosystem: {error}
      </p>
    );
  }
  if (!Screen) {
    return (
      <p className="pierron-helper" style={{ padding: 24 }}>
        …
      </p>
    );
  }
  return <Screen />;
}
