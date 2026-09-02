import type { AppSettings } from '../../shared/core/config';
import {
  getLightBackend,
  resetLightBackendForTests,
  setLightBackend,
} from '../../shared/light/lightClient';
import { mergeRealLocalLightBackends } from '../../shared/light/mergeRealLocalLightBackend';
import {
  resetLightLocalRuntimeOverride,
  setLightLocalRuntimeOverride,
} from '../../shared/light/lightLocalRuntime';

import {
  resolveStealthLightRuntimeUrls,
  type StealthLightRuntimeUrls,
} from './stealthClusterWeb';

let installedFor: string | null = null;

function runtimeKey(urls: StealthLightRuntimeUrls): string {
  return `${urls.rpcUrl}|${urls.photonUrl}|${urls.indexerUrl}|${urls.proverUrl}`;
}

/**
 * Install real Light register/send/claim backends for browser Safe Send.
 * Dynamic imports keep Next from evaluating heavy modules at page load.
 */
export async function installStealthLightBackendForWeb(
  settings: AppSettings
): Promise<StealthLightRuntimeUrls> {
  const urls = resolveStealthLightRuntimeUrls(settings);
  const key = runtimeKey(urls);
  if (installedFor === key) return urls;

  const [
    { installRealLocalRegisterLightBackend },
    { installRealLocalSendLightBackend },
    { installRealLocalClaimLightBackend },
  ] = await Promise.all([
    import('../../tests/helpers/installRealLocalRegisterLightBackend.ts'),
    import('../../tests/helpers/installRealLocalSendLightBackend.ts'),
    import('../../tests/helpers/installRealLocalClaimLightBackend.ts'),
  ]);

  resetLightBackendForTests();
  resetLightLocalRuntimeOverride();
  // Full URL set (rpc + photon + indexer + prover). Missing indexer previously left
  // Light on 127.0.0.1:8784 → Firefox NetworkError on register.
  setLightLocalRuntimeOverride({
    rpcUrl: urls.rpcUrl,
    photonUrl: urls.photonUrl,
    indexerUrl: urls.indexerUrl,
    proverUrl: urls.proverUrl,
  });

  // Register bierze runtime z setLightLocalRuntimeOverride (brak options.runtime w API).
  installRealLocalRegisterLightBackend();
  const registerBackend = getLightBackend();

  installRealLocalSendLightBackend(undefined, { runtime: urls });
  const sendBackend = getLightBackend();

  installRealLocalClaimLightBackend(undefined, { runtime: urls });
  const claimBackend = getLightBackend();

  setLightBackend(mergeRealLocalLightBackends(registerBackend, sendBackend, claimBackend));
  installedFor = key;
  return urls;
}
