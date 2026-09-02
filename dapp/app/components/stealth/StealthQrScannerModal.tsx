'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  decodeQrFromImageData,
  stopMediaStream,
  type StealthQrKind,
} from '../../lib/stealthQrWeb';

export type StealthQrScanMode = 'camera' | 'screen';

type Props = {
  open: boolean;
  expectKind?: StealthQrKind;
  title: string;
  hintCamera: string;
  hintScreen: string;
  labelCamera: string;
  labelScreen: string;
  labelCancel: string;
  labelScanning: string;
  labelPickSource: string;
  onClose: () => void;
  onScanned: (raw: string) => void | Promise<void>;
};

/**
 * Dwa tryby jak w Exodus:
 * - camera: getUserMedia (telefon / webcam)
 * - screen: getDisplayMedia — wybór okna/ekranu z QR (desktop)
 */
export default function StealthQrScannerModal({
  open,
  expectKind: _expectKind,
  title,
  hintCamera,
  hintScreen,
  labelCamera,
  labelScreen,
  labelCancel,
  labelScanning,
  labelPickSource,
  onClose,
  onScanned,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const handledRef = useRef(false);

  const [mode, setMode] = useState<StealthQrScanMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const cleanup = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    if (!open) {
      handledRef.current = false;
      setMode(null);
      setError(null);
      cleanup();
    }
    return () => cleanup();
  }, [open, cleanup]);

  const finishWithRaw = useCallback(
    async (raw: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      cleanup();
      try {
        await Promise.resolve(onScanned(raw));
      } catch (err) {
        handledRef.current = false;
        setError(String((err as Error)?.message ?? err));
        setMode(null);
        throw err;
      }
    },
    [cleanup, onScanned]
  );

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || handledRef.current) return;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      const maxSide = 960;
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.max(1, Math.floor(video.videoWidth * scale));
      const h = Math.max(1, Math.floor(video.videoHeight * scale));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        try {
          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const decoded = decodeQrFromImageData(imageData);
          if (decoded) {
            void finishWithRaw(decoded).catch(() => {
              /* błąd już w state */
            });
            return;
          }
        } catch {
          /* jsQR / canvas frame errors — keep scanning */
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [finishWithRaw]);

  const startStream = useCallback(
    async (nextMode: StealthQrScanMode) => {
      setError(null);
      handledRef.current = false;
      cleanup();
      setMode(nextMode);
      setScanning(true);

      try {
        if (!navigator.mediaDevices) {
          throw new Error('Brak MediaDevices — użyj HTTPS lub nowszej przeglądarki.');
        }

        let stream: MediaStream;
        if (nextMode === 'camera') {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } else {
          // Exodus-style: użytkownik wybiera okno/ekran z widocznym QR.
          stream = await navigator.mediaDevices.getDisplayMedia({
            audio: false,
            video: true,
          });
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          throw new Error('Podgląd wideo niedostępny.');
        }
        video.srcObject = stream;
        await video.play();

        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (!handledRef.current) {
            setError('Udostępnianie ekranu / kamery zostało przerwane.');
            cleanup();
            setMode(null);
          }
        });

        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        cleanup();
        setMode(null);
        const msg = String((err as Error)?.message ?? err);
        if (/NotAllowedError|Permission denied|Permission dismissed/i.test(msg)) {
          setError(
            nextMode === 'screen'
              ? 'Odrzucono udostępnianie ekranu. Wybierz okno z QR i zezwól na podgląd.'
              : 'Odrzucono dostęp do kamery. Zezwól w przeglądarce i spróbuj ponownie.'
          );
        } else if (/NotFoundError|DevicesNotFound/i.test(msg)) {
          setError('Nie znaleziono kamery na tym urządzeniu.');
        } else if (/getDisplayMedia|display-capture|NotSupported/i.test(msg)) {
          setError(
            'Przechwytywanie ekranu niedostępne w tej przeglądarce. Użyj Chrome/Edge na PC albo skanu kamerą.'
          );
        } else {
          setError(msg);
        }
      }
    },
    [cleanup, tick]
  );

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
          width: 'min(520px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: '#121212',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2 className="pierron-card-label" style={{ marginTop: 0 }}>
          {title}
        </h2>

        {!mode ? (
          <>
            <p className="pierron-helper">{labelPickSource}</p>
            <p className="pierron-helper">{hintCamera}</p>
            <button
              type="button"
              className="pierron-btn-primary"
              style={{ marginTop: 12, width: '100%' }}
              onClick={() => void startStream('camera')}
            >
              {labelCamera}
            </button>
            <p className="pierron-helper" style={{ marginTop: 16 }}>
              {hintScreen}
            </p>
            <button
              type="button"
              className="pierron-btn-secondary"
              style={{ marginTop: 8, width: '100%' }}
              onClick={() => void startStream('screen')}
            >
              {labelScreen}
            </button>
          </>
        ) : (
          <>
            <p className="pierron-helper">
              {scanning ? labelScanning : mode === 'camera' ? hintCamera : hintScreen}
            </p>
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '4 / 3',
                background: '#000',
                borderRadius: 8,
                overflow: 'hidden',
                marginTop: 12,
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </>
        )}

        {error ? (
          <p className="pierron-helper" style={{ color: '#ff8a80', marginTop: 12 }}>
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="pierron-link"
          style={{ marginTop: 16 }}
          onClick={() => {
            cleanup();
            onClose();
          }}
        >
          {labelCancel}
        </button>
      </div>
    </div>
  );
}
