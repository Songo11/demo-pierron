'use client';

import { useEffect } from 'react';
import { pierronMeteoraAgUrl } from '../../../../shared/meteora/pierronPoolExplorer.ts';

/** Redirect to exact Meteora URL (avoids corrupted paste from chat). */
export default function GoMeteoraPage() {
  useEffect(() => {
    window.location.replace(pierronMeteoraAgUrl('devnet'));
  }, []);

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui', color: '#e2e8f0', background: '#0b1220', minHeight: '100vh' }}>
      <p>Przekierowanie do Meteora (dokładny adres puli)…</p>
      <p>
        <a href={pierronMeteoraAgUrl('devnet')} style={{ color: '#38bdf8' }}>
          Kliknij tutaj
        </a>{' '}
        jeśli przekierowanie nie zadziała.
      </p>
      <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>
        Swap PIERRON: <a href="/meteora" style={{ color: '#38bdf8' }}>/meteora</a> w tej dapp (zalecane).
      </p>
    </main>
  );
}
