import { Connection, PublicKey } from '@solana/web3.js';

import type { AppSettings } from '../../../shared/core/config';
import { getProgramIds, setCurrentCluster } from '../../../shared/core/programIds';
import {
  PIERRON_DEVNET_RPC_PROXY_DEFAULT,
  readDevnetHeliusProxyUrlFromEnv,
  resolvePierronDevnetCompressionEndpoint,
  resolvePierronDevnetDexRpcCandidates,
} from '../../../shared/solana/devnetRpcDefaults.ts';
import { createResilientConnection } from '../../../shared/solana/resilientConnection.ts';
import { isPublicSolanaClusterRpc } from '../../../shared/solana/rpcEndpoint.ts';
import { resolveDexRpcEndpoint } from '../../../shared/meteora/resolveDexRpcEndpoint.ts';

import { pierronDevnet } from './pierronDevnet';

const LEGACY_DEVNET_MINTS = new Set([
  '9JBzAStvTBqNVE2cxg9TPUXbT8tNMgRkptH5dcZofitT',
  'BcGrJZ2sfYYuHRAYsGqcB9nkbzp5XQjrtn1HcrXyoC6D',
]);

export type StealthLightRuntimeUrls = {
  rpcUrl: string;
  photonUrl: string;
  /** Must match photon on devnet — createRpc uses this; default local runtime is 127.0.0.1:8784. */
  indexerUrl: string;
  proverUrl: string;
};

function isLoopbackRpcUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host === '::1'
    );
  } catch {
    return false;
  }
}

/** Public DEX RPCs often lack browser CORS and never speak Photon. */
function isBrowserHostileLightRpcUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  if (!normalized) return true;
  if (isLoopbackRpcUrl(normalized)) return true;
  if (isPublicSolanaClusterRpc(normalized)) return true;
  if (normalized.includes('api.devnet.solana.com')) return true;
  if (normalized.includes('onfinality.io')) return true;
  return false;
}

function resolveBrowserSafeDevnetLightEndpoint(candidate: string): string {
  if (!isBrowserHostileLightRpcUrl(candidate)) return candidate;
  return (
    readDevnetHeliusProxyUrlFromEnv() ||
    PIERRON_DEVNET_RPC_PROXY_DEFAULT
  );
}

/**
 * Browser → same-origin Next proxy. Direct Worker calls fail CORS preflight because
 * @solana/web3.js sends `solana-client` and the Worker historically didn't allow it.
 */
export function resolveBrowserSolanaRpcProxyUrl(): string {
  if (typeof window === 'undefined') {
    return (
      readDevnetHeliusProxyUrlFromEnv() ||
      PIERRON_DEVNET_RPC_PROXY_DEFAULT
    );
  }
  return `${window.location.origin}/api/solana-rpc`;
}

/** Same URL resolution as lotteryClaimWeb — avoids pulling stealthOnChainExecutor at module load. */
export function resolveStealthLightRuntimeUrls(settings: AppSettings): StealthLightRuntimeUrls {
  const cluster = settings.cluster === 'localnet' ? 'localnet' : 'devnet';
  setCurrentCluster(cluster);

  if (cluster === 'localnet') {
    const photonUrl = settings.lightPhotonUrl?.trim() || 'http://127.0.0.1:8784';
    return {
      rpcUrl: settings.solanaRpcUrl?.trim() || 'http://127.0.0.1:8899',
      photonUrl,
      indexerUrl: photonUrl,
      proverUrl: settings.lightProverUrl?.trim() || 'http://127.0.0.1:3001',
    };
  }

  const compressionEndpoint = resolvePierronDevnetCompressionEndpoint({
    solanaRpcUrl: settings.solanaRpcUrl?.trim() || pierronDevnet.rpcUrl,
    lightPhotonUrl: settings.lightPhotonUrl,
  });
  const safeRemote = resolveBrowserSafeDevnetLightEndpoint(compressionEndpoint);
  // In the browser always use /api/solana-rpc (avoids Worker CORS + solana-client).
  const endpoint =
    typeof window !== 'undefined' ? resolveBrowserSolanaRpcProxyUrl() : safeRemote;
  const customProver = settings.lightProverUrl?.trim();
  const proverUrl =
    typeof window !== 'undefined'
      ? endpoint
      : customProver || safeRemote;
  return {
    rpcUrl: endpoint,
    photonUrl: endpoint,
    indexerUrl: endpoint,
    proverUrl,
  };
}

export function resolveStealthRpcEndpoint(settings: AppSettings): string {
  if (typeof window !== 'undefined' && settings.cluster !== 'localnet') {
    return resolveBrowserSolanaRpcProxyUrl();
  }
  const custom = settings.solanaRpcUrl?.trim();
  if (custom) return custom;
  if (settings.cluster === 'localnet' || settings.cluster === 'devnet') {
    try {
      return resolveStealthLightRuntimeUrls(settings).rpcUrl;
    } catch {
      return resolveDexRpcEndpoint(settings);
    }
  }
  return resolveDexRpcEndpoint(settings);
}

export function createStealthWebConnection(
  rpcUrl: string,
  settings: Pick<AppSettings, 'cluster' | 'solanaRpcUrl' | 'lightPhotonUrl'>
): Connection {
  if (settings.cluster === 'devnet' || settings.cluster === 'localnet') {
    const candidates = resolvePierronDevnetDexRpcCandidates(settings).filter(
      (url) => !url.includes('api.devnet.solana.com') && !isPublicSolanaClusterRpc(url)
    );
    if (candidates.length === 0) {
      throw new Error(
        'Brak Workera Pierron / własnego RPC. Ustaw RPC w Ustawieniach (devnet proxy).'
      );
    }
    const preferred =
      rpcUrl &&
      !rpcUrl.includes('api.devnet.solana.com') &&
      !isPublicSolanaClusterRpc(rpcUrl)
        ? rpcUrl
        : candidates[0]!;
    const primary = candidates.find((url) => url === preferred) ?? candidates[0]!;
    const fallbacks = candidates.filter((url) => url !== primary);
    return createResilientConnection(primary, 'confirmed', { fallbackRpcUrls: fallbacks });
  }
  return createResilientConnection(rpcUrl, 'confirmed');
}

export function defaultStealthMintForSettings(settings: AppSettings): string {
  const normalized = settings.cluster === 'localnet' ? 'devnet' : settings.cluster;
  setCurrentCluster(normalized);
  const ids = getProgramIds(normalized);
  const configuredMint = ids.tokenMint?.toBase58() ?? pierronDevnet.tokenMint.toBase58();
  const fromSettings = settings.stealthMintAddress?.trim();
  if (
    fromSettings &&
    !(normalized === 'devnet' && LEGACY_DEVNET_MINTS.has(fromSettings) && configuredMint)
  ) {
    return fromSettings;
  }
  return configuredMint;
}

export function parseStealthMint(mintAddress: string, settings: AppSettings): PublicKey {
  const raw = mintAddress.trim() || defaultStealthMintForSettings(settings);
  return new PublicKey(raw);
}
