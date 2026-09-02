'use client';

import { useEffect, useState } from 'react';

import { wrapStealthQrPayload, type StealthQrKind } from '../../lib/stealthQrWeb';

type Props = {
  open: boolean;
  kind: StealthQrKind;
  payload: string;
  title: string;
  hint: string;
  labelClose: string;
  onClose: () => void;
};

/** Pokazuje QR (np. na PC), żeby drugi telefon zeskanował kamerą. */
export default function StealthQrDisplayModal({
  open,
  kind,
  payload,
  title,
  hint,
  labelClose,
  onClose,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !payload.trim()) {
      setDataUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const wrapped = wrapStealthQrPayload(kind, payload);
        const QRCode = (await import('qrcode')).default;
        const url = await QRCode.toDataURL(wrapped, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 320,
          color: { dark: '#000000', light: '#ffffff' },
        });
        if (!cancelled) {
          setDataUrl(url);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setDataUrl(null);
          setError(String((err as Error)?.message ?? err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kind, payload]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="pierron-card"
        style={{
          width: 'min(400px, 100%)',
          background: '#121212',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 20,
          textAlign: 'center',
        }}
      >
        <h2 className="pierron-card-label" style={{ marginTop: 0 }}>
          {title}
        </h2>
        <p className="pierron-helper">{hint}</p>
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="Safe Send QR"
            width={280}
            height={280}
            style={{ margin: '16px auto', display: 'block', borderRadius: 8 }}
          />
        ) : error ? (
          <p className="pierron-helper" style={{ color: '#ff8a80' }}>
            {error}
          </p>
        ) : (
          <p className="pierron-helper">…</p>
        )}
        <button type="button" className="pierron-btn-primary" onClick={onClose}>
          {labelClose}
        </button>
      </div>
    </div>
  );
}
