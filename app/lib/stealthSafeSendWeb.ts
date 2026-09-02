import { Connection, PublicKey } from '@solana/web3.js';

import type { AppSettings } from '../../shared/core/config';
import { getPierronStealthProgramId, setCurrentCluster } from '../../shared/core/programIds';
import {
  probeSendPaymentPhotonIndex,
  resolveIndexedSendPaymentAddress,
} from '../../shared/light/claimLightDiscovery.ts';
import {
  prepareClaimStealthExecution,
  prepareRegisterStealthExecution,
  prepareSendStealthExecution,
} from '../../shared/mobile-stealth-v1/stealthActions';
import {
  buildRecipientBundleV1,
  bundleToRecipientKeys,
  parseRecipientBundleFromTransfer,
  serializeRecipientBundleForClipboard,
  serializeRecipientBundleV1,
  type StealthRecipientBundleV1,
} from '../../shared/mobile-stealth-v1/stealthRecipientBundle';
import {
  buildStealthPaymentNotificationV1,
  lightAddressSeedHexToBytes,
  parsePaymentNotificationFromTransfer,
  serializePaymentNotificationForSeal,
  tryNormalizeClaimSeedHexInput,
} from '../../shared/mobile-stealth-v1/stealthPaymentNotification';
import { buildSealedPaymentNotificationClipboard } from '../../shared/mobile-stealth-v1/stealthPaymentNotificationSeal';
import {
  addStealthClaimable,
  addStealthPending,
  clearRecipientBundleV1,
  getStealthKeys,
  getStealthMeta,
  resolveStoredClaimPaymentTarget,
  saveLastSenderPaymentNotification,
  saveLastSenderPaymentSealedClipboard,
  saveRecipientBundleV1,
  saveStealthKeys,
  saveStealthMeta,
} from '../../shared/mobile-stealth-v1/stealthStorage';
import { parseHumanTokenAmountToBaseUnits } from '../../shared/mobile-stealth-v1/stealthTokenAmount.ts';
import {
  resolveAndCheckStealthTokenAccounts,
} from '../../shared/mobile-stealth-v1/stealthTokenAccounts';

import { loadAppSettings } from './appSettings';
import { installStealthLightBackendForWeb } from './installStealthLightBackendWeb';
import {
  createStealthWebConnection,
  defaultStealthMintForSettings,
  parseStealthMint,
  resolveStealthRpcEndpoint,
} from './stealthClusterWeb';
import { ensureStealthWebStorage } from './stealthStorageWeb';
import {
  createWebStealthWalletExecutor,
  type WebStealthWallet,
} from './stealthWalletWeb';

export type PreparedSendContext = {
  stealthAddress: string;
  lightAddressSeedBytes: number[];
  amount: string;
  mint: string;
  senderHash?: string;
  recipientSpendKey: number[];
  recipientViewKey: number[];
  intendedClaimer: string;
  outputTreeIndex: number;
};

export type PreparedClaimContext = {
  stealthAddress: string;
  metaOwner: string;
  mint: string;
  amount?: string;
  lightAddressSeedHex?: string;
  sender?: string;
  senderHash?: string;
  sendSignature?: string;
};

export type StealthActionResult = {
  ok: boolean;
  message: string;
  signature?: string;
  sealedPaymentClipboard?: string;
  recipientBundleClipboard?: string;
  preparedSend?: PreparedSendContext;
  preparedClaim?: PreparedClaimContext;
  loadedRecipientBundle?: StealthRecipientBundleV1;
  recipientBundleText?: string;
};

type StageFn = (message: string) => void;

async function loadStealthOnChain() {
  return import('../../../shared/mobile-stealth-v1/stealthOnChainExecutor.ts');
}

function seedBytesToHex(bytes: number[] | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes;
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function optionalSeedHexFromPrepared(bytes?: number[] | Uint8Array): string | undefined {
  const arr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes ? [...bytes] : [];
  if (arr.length !== 32) return undefined;
  return seedBytesToHex(arr);
}

function normalize32Bytes(value: number[], label: string): number[] {
  if (!Array.isArray(value) || value.length !== 32) {
    throw new Error(`${label} musi mieć dokładnie 32 bajty.`);
  }
  return value;
}

async function getConnectionAndSettings(): Promise<{
  settings: AppSettings;
  connection: Connection;
}> {
  ensureStealthWebStorage();
  const settings = await loadAppSettings();
  setCurrentCluster(settings.cluster === 'localnet' ? 'devnet' : settings.cluster);
  await installStealthLightBackendForWeb(settings);
  const endpoint = resolveStealthRpcEndpoint(settings);
  return {
    settings,
    connection: createStealthWebConnection(endpoint, settings),
  };
}

function requireSignTransaction(
  wallet: WebStealthWallet & { signTransaction?: WebStealthWallet['signTransaction'] | null }
): WebStealthWallet {
  if (!wallet.signTransaction) {
    throw new Error('Portfel nie obsługuje podpisywania transakcji (signTransaction).');
  }
  return wallet as WebStealthWallet;
}

export async function prepareRegisterStealthWeb(params: {
  publicKey: PublicKey;
}): Promise<StealthActionResult> {
  const { settings } = await getConnectionAndSettings();
  const execution = await prepareRegisterStealthExecution({
    owner: params.publicKey,
    cluster: settings.cluster,
  });

  await saveStealthKeys({
    spendPublicKey: execution.payload.spendPublicKey,
    viewPublicKey: execution.payload.viewPublicKey,
    viewSecretKey: execution.payload.viewSecretKey,
  });
  await saveStealthMeta({
    owner: execution.payload.owner,
    nonce: execution.payload.nonce,
    registeredAt: execution.payload.registeredAt,
    transactionCount: execution.payload.transactionCount,
  });
  await addStealthPending({
    type: 'register_stealth',
    status: 'prepared',
    notes: ['Lokalna rejestracja przygotowana (web).'],
  });

  return {
    ok: true,
    message: `Prepare register OK. Owner ${execution.payload.owner}. Następny krok: Wykonaj register on-chain.`,
  };
}

export async function executeRegisterStealthWeb(params: {
  publicKey: PublicKey;
  wallet: WebStealthWallet;
  onStage?: StageFn;
}): Promise<StealthActionResult> {
  const wallet = requireSignTransaction(params.wallet);
  const { settings, connection } = await getConnectionAndSettings();
  const onChain = await loadStealthOnChain();
  const executor = createWebStealthWalletExecutor({ connection, wallet });

  params.onStage?.('Przygotowuję bundle Light (bez portfela)…');
  const execution = await prepareRegisterStealthExecution({
    owner: params.publicKey,
    cluster: settings.cluster,
  });
  const seed = Uint8Array.from(execution.payload.lightAddressSeedBytes);

  const bundle = await onChain.prepareRegisterStealthLightBundle({
    owner: params.publicKey,
    cluster: settings.cluster,
    lightAddressSeed: seed,
  });

  params.onStage?.('Buduję instrukcję register…');
  const prebuiltInstruction = await onChain.buildRegisterStealthInstructionFromPreparedBundle({
    owner: params.publicKey,
    cluster: settings.cluster,
    bundle,
    lightAddressSeed: seed,
  });

  params.onStage?.('Zatwierdź register w portfelu…');
  const signed = await onChain.signPrebuiltRegisterStealthInstruction(connection, executor, {
    built: prebuiltInstruction,
    skipPreSendSimulation: true,
  });
  if (!signed.ok) {
    return { ok: false, message: signed.error ?? 'Podpis register nie powiódł się.' };
  }

  params.onStage?.('Wysyłam transakcję…');
  const result = await onChain.submitSignedStealthTransaction(connection, signed.package);
  if (result.ok) {
    const registerAddressAccount = bundle.remainingAccounts.find(
      (account) => account.role === 'address'
    );
    if (registerAddressAccount?.pubkey) {
      const meta = await getStealthMeta();
      if (meta) {
        await saveStealthMeta({
          ...meta,
          compressedMetaAddress: registerAddressAccount.pubkey,
        });
      }
    }
  }

  return {
    ok: result.ok,
    message: result.ok
      ? `Register OK.${result.signature ? ` Sig: ${result.signature}` : ''}`
      : result.error ?? 'Register on-chain nie powiódł się.',
    signature: result.signature,
  };
}

export async function copyOwnRecipientBundleWeb(params: {
  publicKey: PublicKey;
}): Promise<StealthActionResult> {
  ensureStealthWebStorage();
  const [keys, meta] = await Promise.all([getStealthKeys(), getStealthMeta()]);
  if (!keys) {
    return {
      ok: false,
      message: 'Brak lokalnych kluczy stealth — najpierw Prepare + Execute register.',
    };
  }

  const bundle = buildRecipientBundleV1({
    owner: meta?.owner ?? params.publicKey,
    spendPublicKey: normalize32Bytes(keys.spendPublicKey, 'spendPublicKey'),
    viewPublicKey: normalize32Bytes(keys.viewPublicKey, 'viewPublicKey'),
  });
  const serialized = serializeRecipientBundleForClipboard(bundle);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(serialized);
  }

  return {
    ok: true,
    message: `Recipient bundle skopiowany (owner ${bundle.owner ?? params.publicKey.toBase58()}).`,
    recipientBundleClipboard: serialized,
  };
}

export async function loadRecipientBundleWeb(
  raw: string
): Promise<StealthActionResult> {
  ensureStealthWebStorage();
  const bundle = parseRecipientBundleFromTransfer(raw);
  await saveRecipientBundleV1(bundle);
  return {
    ok: true,
    message: `Bundle odbiorcy załadowany (owner ${bundle.owner ?? 'unknown'}).`,
    loadedRecipientBundle: bundle,
    recipientBundleText: serializeRecipientBundleV1(bundle),
  };
}

export async function clearRecipientBundleWeb(): Promise<StealthActionResult> {
  ensureStealthWebStorage();
  await clearRecipientBundleV1();
  return { ok: true, message: 'Wyczyszczono recipient bundle.' };
}

export async function prepareSendStealthWeb(params: {
  publicKey: PublicKey;
  amount: string;
  mintAddress?: string;
  recipientBundle: StealthRecipientBundleV1 | null;
  recipientBundleText: string;
}): Promise<StealthActionResult> {
  if (!params.amount.trim()) {
    return { ok: false, message: 'Podaj kwotę PIERRON.' };
  }

  const { settings } = await getConnectionAndSettings();
  const mint = parseStealthMint(params.mintAddress ?? '', settings);
  const [keys, meta] = await Promise.all([getStealthKeys(), getStealthMeta()]);
  if (!keys || !meta) {
    return {
      ok: false,
      message: 'Najpierw zarejestruj stealth (Prepare + Execute register).',
    };
  }

  const recipientBundle =
    params.recipientBundle ??
    parseRecipientBundleFromTransfer(params.recipientBundleText);
  if (!recipientBundle.owner?.trim()) {
    return {
      ok: false,
      message:
        'Recipient bundle musi mieć owner. Odbiorca: Skopiuj mój recipient bundle po register.',
    };
  }

  const { recipientSpendKey, recipientViewKey } = bundleToRecipientKeys(recipientBundle);
  const execution = await prepareSendStealthExecution({
    sender: params.publicKey,
    mint,
    amount: parseHumanTokenAmountToBaseUnits(params.amount),
    recipientSpendKey,
    recipientViewKey,
    intendedClaimer: recipientBundle.owner,
    recipientBundle,
    allowDebugRecipientGeneration: false,
    cluster: settings.cluster,
  });

  const preparedSend: PreparedSendContext = {
    stealthAddress: execution.payload.stealthAddress,
    lightAddressSeedBytes: execution.payload.canonicalLightAddressSeed,
    amount: execution.payload.amount,
    mint: execution.payload.mint,
    senderHash: execution.payload.paymentAccount.senderHash,
    recipientSpendKey: execution.payload.recipientSpendKey,
    recipientViewKey: execution.payload.recipientViewKey,
    intendedClaimer: execution.payload.paymentAccount.intendedClaimer,
    outputTreeIndex: execution.payload.outputTreeIndex,
  };

  await addStealthPending({
    type: 'send_stealth',
    status: 'prepared',
    mint: execution.payload.mint,
    amount: execution.payload.amount,
    stealthAddress: execution.payload.stealthAddress,
    senderHash: execution.payload.paymentAccount.senderHash,
    recipientMode: execution.payload.recipientMode,
  });
  await addStealthClaimable({
    mint: execution.payload.mint,
    stealthAddress: execution.payload.stealthAddress,
    amount: execution.payload.amount,
    claimed: false,
    senderHash: execution.payload.paymentAccount.senderHash,
    owner: execution.payload.sender,
    recipientMode: execution.payload.recipientMode,
  });

  return {
    ok: true,
    message: `Prepare send OK → ${execution.payload.stealthAddress}. Następny krok: Wyślij on-chain.`,
    preparedSend,
  };
}

export async function executeSendStealthWeb(params: {
  publicKey: PublicKey;
  wallet: WebStealthWallet;
  preparedSend: PreparedSendContext;
  recipientBundle: StealthRecipientBundleV1 | null;
  recipientBundleText: string;
  onStage?: StageFn;
}): Promise<StealthActionResult> {
  const wallet = requireSignTransaction(params.wallet);
  const { settings, connection } = await getConnectionAndSettings();
  const onChain = await loadStealthOnChain();
  const executor = createWebStealthWalletExecutor({ connection, wallet });

  const recipientBundle =
    params.recipientBundle ??
    parseRecipientBundleFromTransfer(params.recipientBundleText);
  const { recipientSpendKey, recipientViewKey } = bundleToRecipientKeys(recipientBundle);
  const intendedClaimer =
    params.preparedSend.intendedClaimer || recipientBundle.owner;
  if (!intendedClaimer) {
    return {
      ok: false,
      message:
        'Brak intendedClaimer. Prepare Send ponownie z bundlem odbiorcy (owner).',
    };
  }

  params.onStage?.('Buduję send (Photon)…');
  const built = await onChain.prepareSendStealthBuiltInstruction({
    connection,
    wallet: executor,
    sender: params.publicKey,
    mint: new PublicKey(params.preparedSend.mint),
    amount: BigInt(params.preparedSend.amount),
    stealthAddress: new PublicKey(params.preparedSend.stealthAddress),
    lightAddressSeed: Uint8Array.from(params.preparedSend.lightAddressSeedBytes),
    recipientSpendKey: Uint8Array.from(recipientSpendKey),
    recipientViewKey: Uint8Array.from(recipientViewKey),
    intendedClaimer,
    recipientBundle,
    cluster: settings.cluster,
    outputTreeIndex: params.preparedSend.outputTreeIndex,
  });

  params.onStage?.('Zatwierdź send w portfelu…');
  const signed = await onChain.signPrebuiltSendStealthInstruction(connection, executor, {
    built,
    skipPreSendSimulation: true,
  });
  if (!signed.ok) {
    return { ok: false, message: signed.error ?? 'Podpis send nie powiódł się.' };
  }

  params.onStage?.('Wysyłam send…');
  const result = await onChain.submitSignedStealthTransaction(connection, signed.package);

  let notificationStealthAddress = params.preparedSend.stealthAddress;
  let sealedPaymentClipboard: string | undefined;

  if (result.ok) {
    try {
      const indexedAfter = await resolveIndexedSendPaymentAddress({
        preparedStealthAddress: new PublicKey(params.preparedSend.stealthAddress),
        proofOwner: params.publicKey,
        lightAddressSeed: Uint8Array.from(params.preparedSend.lightAddressSeedBytes),
        cluster: settings.cluster,
      });
      notificationStealthAddress = indexedAfter.address.toBase58();
    } catch {
      // keep prepared
    }

    const notification = buildStealthPaymentNotificationV1({
      mint: params.preparedSend.mint,
      stealthAddress: notificationStealthAddress,
      amount: params.preparedSend.amount,
      metaOwner: recipientBundle.owner,
      sender: params.publicKey.toBase58(),
      senderHash: params.preparedSend.senderHash,
      lightAddressSeedHex: optionalSeedHexFromPrepared(
        params.preparedSend.lightAddressSeedBytes
      ),
      sendSignature: result.signature,
      recipientMode: 'provided',
    });
    if (!notification.lightAddressSeedHex) {
      throw new Error('Brak seed send — prepare send ponownie przed powiadomieniem.');
    }

    void probeSendPaymentPhotonIndex({
      paymentAddress: new PublicKey(notificationStealthAddress),
      cluster: settings.cluster,
      maxAttempts: 12,
      delayMs: 3000,
    }).catch(() => undefined);

    sealedPaymentClipboard = buildSealedPaymentNotificationClipboard({
      plaintextJson: serializePaymentNotificationForSeal(notification),
      recipientViewPublicKey: recipientViewKey,
    });
    await saveLastSenderPaymentNotification(notification);
    await saveLastSenderPaymentSealedClipboard(sealedPaymentClipboard);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(sealedPaymentClipboard);
    }
  }

  return {
    ok: result.ok,
    message: result.ok
      ? `Send OK.${result.signature ? ` Sig: ${result.signature}` : ''} Powiadomienie (sealed) skopiowane do schowka — przekaż odbiorcy.`
      : result.error ?? 'Send on-chain nie powiódł się.',
    signature: result.signature,
    sealedPaymentClipboard,
  };
}

export async function ingestPaymentNotificationWeb(params: {
  publicKey: PublicKey;
  raw: string;
  preparedClaim?: PreparedClaimContext | null;
}): Promise<StealthActionResult> {
  ensureStealthWebStorage();
  const keys = await getStealthKeys();
  const meta = await getStealthMeta();
  const notification = parsePaymentNotificationFromTransfer(params.raw, {
    viewSecretKey: keys?.viewSecretKey,
    localViewPublicKey: keys?.viewPublicKey,
  });
  const metaOwner =
    notification.metaOwner ?? meta?.owner ?? params.publicKey.toBase58();
  if (!metaOwner) {
    return { ok: false, message: 'Brak meta owner — zarejestruj stealth.' };
  }

  await addStealthClaimable({
    mint: notification.mint,
    stealthAddress: notification.stealthAddress,
    amount: notification.amount,
    claimed: false,
    owner: metaOwner,
    senderHash: notification.senderHash,
    recipientMode: notification.recipientMode ?? 'provided',
    lightAddressSeedHex: notification.lightAddressSeedHex,
  });

  const preparedClaim: PreparedClaimContext = {
    stealthAddress: notification.stealthAddress,
    metaOwner,
    mint: notification.mint,
    amount: notification.amount,
    lightAddressSeedHex: notification.lightAddressSeedHex,
    sender: notification.sender,
    senderHash: notification.senderHash,
    sendSignature: notification.sendSignature,
  };

  return {
    ok: true,
    message: `Powiadomienie zapisane → ${notification.stealthAddress}${
      notification.lightAddressSeedHex ? ' (seed OK)' : ' (bez seed — claim może się nie udać)'
    }.`,
    preparedClaim,
  };
}

export async function prepareClaimStealthWeb(params: {
  publicKey: PublicKey;
  mintAddress?: string;
  claimSeedHex?: string;
  preparedClaim?: PreparedClaimContext | null;
  paymentRaw?: string;
}): Promise<StealthActionResult> {
  const { settings } = await getConnectionAndSettings();
  let mint = parseStealthMint(params.mintAddress ?? '', settings);
  const meta = await getStealthMeta();

  let claimTarget = await resolveStoredClaimPaymentTarget({
    mint: mint.toBase58(),
    preparedClaim: params.preparedClaim ?? undefined,
  });

  if (!claimTarget && params.paymentRaw?.trim()) {
    try {
      const ingested = await ingestPaymentNotificationWeb({
        publicKey: params.publicKey,
        raw: params.paymentRaw,
      });
      if (ingested.preparedClaim) {
        claimTarget = await resolveStoredClaimPaymentTarget({
          mint: mint.toBase58(),
          preparedClaim: ingested.preparedClaim,
        });
      }
    } catch {
      // ignore
    }
  }

  if (claimTarget && claimTarget.mint !== mint.toBase58()) {
    mint = new PublicKey(claimTarget.mint);
  }

  const seedHex =
    claimTarget?.lightAddressSeedHex?.trim() ||
    params.preparedClaim?.lightAddressSeedHex?.trim() ||
    tryNormalizeClaimSeedHexInput(params.claimSeedHex ?? '') ||
    undefined;
  const lightAddressSeed = lightAddressSeedHexToBytes(seedHex);
  if (!lightAddressSeed || lightAddressSeed.length !== 32) {
    return {
      ok: false,
      message:
        'Brak lightAddressSeedHex (32 B). Wklej sealed powiadomienie od nadawcy albo seed hex.',
    };
  }

  const metaOwnerPk = claimTarget?.metaOwner
    ? new PublicKey(claimTarget.metaOwner)
    : meta?.owner
      ? new PublicKey(meta.owner)
      : params.publicKey;

  const execution = await prepareClaimStealthExecution({
    claimer: params.publicKey,
    mint,
    metaOwner: metaOwnerPk,
    stealthAddress: claimTarget?.stealthAddress
      ? new PublicKey(claimTarget.stealthAddress)
      : undefined,
    registerCompressedAddress: meta?.compressedMetaAddress
      ? new PublicKey(meta.compressedMetaAddress)
      : undefined,
    lightAddressSeed,
    amount: claimTarget?.amount,
    cluster: settings.cluster,
  });

  const preparedClaim: PreparedClaimContext = {
    stealthAddress:
      execution.localData.claimableStealthAddress ??
      claimTarget?.stealthAddress ??
      params.preparedClaim?.stealthAddress ??
      '',
    metaOwner: execution.localData.metaOwner ?? metaOwnerPk.toBase58(),
    mint: execution.localData.mint,
    amount: claimTarget?.amount ?? params.preparedClaim?.amount,
    lightAddressSeedHex: seedHex,
    sender: claimTarget?.sender ?? params.preparedClaim?.sender,
    senderHash: claimTarget?.senderHash ?? params.preparedClaim?.senderHash,
  };

  if (!preparedClaim.stealthAddress) {
    return {
      ok: false,
      message: 'Brak adresu płatności do claim — wklej powiadomienie od nadawcy.',
    };
  }

  return {
    ok: true,
    message: `Prepare claim OK → ${preparedClaim.stealthAddress}. Następny krok: Claim on-chain.`,
    preparedClaim,
  };
}

export async function executeClaimStealthWeb(params: {
  publicKey: PublicKey;
  wallet: WebStealthWallet;
  mintAddress?: string;
  claimSeedHex?: string;
  preparedClaim?: PreparedClaimContext | null;
  onStage?: StageFn;
}): Promise<StealthActionResult> {
  const wallet = requireSignTransaction(params.wallet);
  const { settings, connection } = await getConnectionAndSettings();
  const onChain = await loadStealthOnChain();
  const executor = createWebStealthWalletExecutor({ connection, wallet });

  let mint = parseStealthMint(params.mintAddress ?? '', settings);
  const meta = await getStealthMeta();
  if (!meta?.owner) {
    return {
      ok: false,
      message: 'Brak lokalnej rejestracji stealth — najpierw register on-chain.',
    };
  }

  let claimTarget = await resolveStoredClaimPaymentTarget({
    mint: mint.toBase58(),
    preparedClaim: params.preparedClaim ?? undefined,
  });

  const lightAddressSeed =
    lightAddressSeedHexToBytes(
      claimTarget?.lightAddressSeedHex ??
        params.preparedClaim?.lightAddressSeedHex ??
        tryNormalizeClaimSeedHexInput(params.claimSeedHex ?? '')
    ) ?? null;

  if (!lightAddressSeed || lightAddressSeed.length !== 32) {
    return {
      ok: false,
      message:
        'Brak seed (32 B) — wklej powiadomienie od nadawcy zanim otworzysz portfel.',
    };
  }

  if (claimTarget && claimTarget.mint !== mint.toBase58()) {
    mint = new PublicKey(claimTarget.mint);
  }

  let stealthAddress = claimTarget?.stealthAddress ?? params.preparedClaim?.stealthAddress;
  let metaOwner = claimTarget?.metaOwner ?? params.preparedClaim?.metaOwner ?? meta.owner;

  if (!stealthAddress) {
    const execution = await prepareClaimStealthExecution({
      claimer: params.publicKey,
      mint,
      metaOwner: new PublicKey(metaOwner),
      lightAddressSeed,
      registerCompressedAddress: meta.compressedMetaAddress
        ? new PublicKey(meta.compressedMetaAddress)
        : undefined,
      cluster: settings.cluster,
    });
    stealthAddress = execution.localData.claimableStealthAddress;
    metaOwner = execution.localData.metaOwner ?? meta.owner;
  }

  if (!stealthAddress) {
    return { ok: false, message: 'Brak adresu płatności do claim.' };
  }

  const sendProofOwnerB58 = claimTarget?.sender ?? params.preparedClaim?.sender;
  const sendProofOwner = sendProofOwnerB58
    ? new PublicKey(sendProofOwnerB58)
    : undefined;

  params.onStage?.('Photon: buduję claim (2 ix)…');
  const prepared = await onChain.prepareClaimStealthBuiltInstruction({
    connection,
    claimer: params.publicKey,
    mint,
    stealthAddress: new PublicKey(stealthAddress),
    metaOwner: new PublicKey(metaOwner),
    registerCompressedAddress: meta.compressedMetaAddress
      ? new PublicKey(meta.compressedMetaAddress)
      : undefined,
    lightAddressSeed,
    sendProofOwner,
    expectedPaymentAmount: claimTarget?.amount ?? params.preparedClaim?.amount,
    expectedSenderHash: claimTarget?.senderHash ?? params.preparedClaim?.senderHash,
    cluster: settings.cluster,
    maxPhotonAttempts: 3,
    photonDelayMs: 800,
  });

  const stealthProgramId = getPierronStealthProgramId(settings.cluster);
  const tokenCheck = await resolveAndCheckStealthTokenAccounts({
    connection,
    programId: stealthProgramId,
    mint,
    sender: params.publicKey,
    claimer: params.publicKey,
    tokenProgramId: onChain.STEALTH_TOKEN_PROGRAM_ID,
  });
  const needAtaSetup =
    !tokenCheck.existence.senderToken.exists ||
    !tokenCheck.existence.claimerToken.exists ||
    !tokenCheck.existence.stealthToken.exists;

  if (needAtaSetup) {
    params.onStage?.('Tworzenie kont token — zatwierdź w portfelu…');
    await onChain.ensureStealthTokenAccountsWithWallet({
      connection,
      wallet: executor,
      mint,
      sender: params.publicKey,
      claimer: params.publicKey,
      cluster: settings.cluster,
    });
  }

  params.onStage?.('Buduję pakiet claim…');
  const unsigned = await onChain.prepareUnsignedStealthSignPackage({
    connection,
    payer: params.publicKey,
    instruction: prepared.built.instruction,
    followUpInstructions: prepared.built.followUpInstructions,
    instructionMeta: {
      keyCount: prepared.built.instruction.keys.length,
      dataLength: prepared.built.instruction.data.length,
      buildable: prepared.built.buildable,
      executable: prepared.built.executable,
      canonicalOnly: prepared.built.canonicalOnly,
      debugOnly: prepared.built.debugOnly,
      lightProvenanceKinds: prepared.built.lightProvenanceKinds ?? [],
      summaryLines: prepared.built.summaryLines ?? [],
    },
    cluster: settings.cluster,
    skipPreSendSimulation: true,
  });

  params.onStage?.('Zatwierdź claim w portfelu…');
  const signed = await onChain.signUnsignedStealthPackageInWallet(executor, unsigned);
  if (!signed.ok) {
    return { ok: false, message: signed.error ?? 'Podpis claim nie powiódł się.' };
  }

  params.onStage?.('Wysyłam claim…');
  const result = await onChain.submitSignedStealthTransaction(connection, signed.package);

  return {
    ok: result.ok,
    message: result.ok
      ? `Claim OK.${result.signature ? ` Sig: ${result.signature}` : ''}`
      : result.error ?? 'Claim on-chain nie powiódł się.',
    signature: result.signature,
  };
}

export { defaultStealthMintForSettings };
