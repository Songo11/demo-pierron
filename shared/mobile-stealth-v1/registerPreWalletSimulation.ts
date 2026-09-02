import { Connection, PublicKey, type TransactionInstruction } from '@solana/web3.js';

import type { RegisterLightBundle } from '../light/lightClient.ts';
import { LOCALNET_LIGHT_ACCOUNTS } from '../light/lightCanonicalConfig.ts';
import {
  isRateLimitRpcError,
  isRpcBackendExhaustedError,
} from '../solana/rpcEndpoint.ts';

const REQUIRED_LIGHT_TREE_PUBKEYS = new Set(
  [
    LOCALNET_LIGHT_ACCOUNTS.addressTree,
    LOCALNET_LIGHT_ACCOUNTS.addressQueue,
    LOCALNET_LIGHT_ACCOUNTS.stateQueue,
    LOCALNET_LIGHT_ACCOUNTS.stateTree,
  ].map((pk) => pk.toBase58())
);

/** Large Light accounts (~2MB) — never full-fetch via mobile proxy (hangs / 503). */
const KNOWN_LARGE_LIGHT_ACCOUNTS = new Set(
  [
    LOCALNET_LIGHT_ACCOUNTS.addressTree,
    LOCALNET_LIGHT_ACCOUNTS.stateTree,
  ].map((pk) => pk.toBase58())
);

export function simulationErrorLooksLikeAccountNotFound(error?: string): boolean {
  if (!error) return false;
  return error.includes('AccountNotFound');
}

export function simulationErrorLooksLikeTransientRpc(error?: string): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    isRpcBackendExhaustedError(error) ||
    isRateLimitRpcError(error) ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('503') ||
    lower.includes('-32004') ||
    lower.includes('all helius') ||
    lower.includes('all pierron rpc backends') ||
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('ws error') ||
    lower.includes('websocket')
  );
}

/**
 * Existence probe without full multi-MB account bodies.
 * Known Light merkle trees are treated as present (proxy cannot return full data).
 */
export async function formatMissingInstructionAccounts(
  connection: Connection,
  instruction: TransactionInstruction
): Promise<string> {
  const lines: string[] = [];

  for (let index = 0; index < instruction.keys.length; index += 1) {
    const key = instruction.keys[index]!;
    const id = key.pubkey.toBase58();
    if (KNOWN_LARGE_LIGHT_ACCOUNTS.has(id) || REQUIRED_LIGHT_TREE_PUBKEYS.has(id)) {
      continue;
    }
    try {
      const info = await connection.getAccountInfo(key.pubkey, {
        commitment: 'confirmed',
        dataSlice: { offset: 0, length: 1 },
      });
      if (info) continue;
    } catch {
      // RPC fail — do not block UI with a hang; skip listing this key.
      continue;
    }
    lines.push(
      `  [${index}] ${id} signer=${key.isSigner} writable=${key.isWritable}`
    );
  }

  return lines.length > 0 ? `Missing on-chain accounts:\n${lines.join('\n')}` : '';
}

/**
 * Devnet register: RPC simulateTransaction often returns AccountNotFound for the
 * not-yet-allocated compressed address (and empty Light CPI PDAs). The bundle is
 * already validated via Helius proofs; wallet send uses skipPreSendSimulation.
 *
 * Also soft-pass transient proxy / Photon exhaustion so Register does not hang forever
 * on step 2b (simulate via Cloudflare Worker).
 */
export async function shouldSoftPassRegisterPreWalletSimulation(params: {
  connection: Connection;
  instruction: TransactionInstruction;
  bundle: RegisterLightBundle;
  simulationError?: string;
}): Promise<boolean> {
  if (params.bundle.status !== 'ready') {
    return false;
  }

  if (simulationErrorLooksLikeTransientRpc(params.simulationError)) {
    return true;
  }

  if (!simulationErrorLooksLikeAccountNotFound(params.simulationError)) {
    return false;
  }

  const missing: { pubkey: PublicKey; isSigner: boolean }[] = [];
  for (const key of params.instruction.keys) {
    const id = key.pubkey.toBase58();
    if (KNOWN_LARGE_LIGHT_ACCOUNTS.has(id) || REQUIRED_LIGHT_TREE_PUBKEYS.has(id)) {
      continue;
    }
    try {
      const info = await params.connection.getAccountInfo(key.pubkey, {
        commitment: 'confirmed',
        dataSlice: { offset: 0, length: 1 },
      });
      if (!info) {
        missing.push({ pubkey: key.pubkey, isSigner: key.isSigner });
      }
    } catch {
      // Treat probe failure as soft-pass candidate (same as transient RPC).
      return true;
    }
  }

  if (missing.length === 0) {
    return false;
  }

  if (missing.some((key) => key.isSigner)) {
    return false;
  }

  if (missing.some((key) => REQUIRED_LIGHT_TREE_PUBKEYS.has(key.pubkey.toBase58()))) {
    return false;
  }

  return true;
}
