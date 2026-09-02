'use client';

import type { Idl } from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useEffect, useMemo, useState } from 'react';

import { pierronDevnet } from './pierronDevnet';

const IDL_PATH =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PIERRON_IDL_URL) ||
  '/idl/pierron.json';

const READONLY_WALLET = {
  publicKey: PublicKey.default,
  signTransaction: async <T>(tx: T) => tx,
  signAllTransactions: async <T>(txs: T[]) => txs,
};

export function usePierronProgram() {
  const { connection } = useConnection();
  const { wallet, publicKey, signTransaction } = useWallet();
  const [idl, setIdl] = useState<Idl | null>(null);
  const [idlError, setIdlError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(IDL_PATH, { cache: 'no-store' });
        if (!res.ok) throw new Error(`IDL HTTP ${res.status}`);
        const json = (await res.json()) as Idl;
        if (!cancelled) setIdl(json);
      } catch (e: unknown) {
        if (!cancelled) setIdlError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const provider = useMemo(() => {
    if (!idl) return null;
    const signingWallet =
      wallet?.adapter && publicKey && signTransaction ? wallet.adapter : READONLY_WALLET;
    return new AnchorProvider(connection, signingWallet as never, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
  }, [wallet?.adapter, publicKey, signTransaction, connection, idl]);

  const program = useMemo(() => {
    if (!provider || !idl) return null;
    try {
      const idlForProgram = {
        ...idl,
        address: pierronDevnet.pierronProgramId.toBase58(),
      } as Idl;
      return new Program(idlForProgram, provider);
    } catch (e) {
      console.error('Program init failed', e);
      return null;
    }
  }, [provider, idl]);

  return {
    program,
    connection,
    provider,
    idlLoading: !idl && !idlError,
    idlError,
    programReady: program != null,
  };
}
