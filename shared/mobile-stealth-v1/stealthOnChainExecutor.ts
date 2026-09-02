import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

import {
  buildClaimLightBundle,
  buildRegisterLightBundle,
  buildSendLightBundle,
  type RegisterLightBundle,
} from '../light/lightClient.ts';
import { resolvePierronDevnetCompressionEndpoint } from '../solana/devnetRpcDefaults.ts';
import { confirmSignatureViaHttp } from '../solana/confirmSignatureHttp.ts';
import {
  discoverClaimLightBundleHints,
  resolveIndexedSendPaymentAddress,
} from '../light/claimLightDiscovery.ts';
import { resolveClaimPhotonLeafHints } from '../light/claimStealthPhotonAccounts.ts';
import { resolveStealthOutputTreeIndex } from '../light/lightCanonicalConfig.ts';
import {
  getLightLocalRuntimeOverride,
  type PartialLightLocalRuntimeConfig,
} from '../light/lightLocalRuntime.ts';
import {
  getPierronStealthProgramId,
  setCurrentCluster,
  type SupportedCluster,
} from '../core/programIds.ts';
import {
  createClaimStealthInstructionFromLightBundle,
  createRegisterStealthInstructionFromLightBundle,
  createSendStealthInstructionFromLightBundle,
} from './stealthLightReadyFactory.ts';
import type { BuiltStealthInstructionResult } from './stealthTransactionFactory.ts';
import {
  sendClaimStealthFromLightBundle,
  sendPrebuiltRegisterStealthInstruction,
  sendRegisterStealthFromLightBundle,
  sendSendStealthFromLightBundle,
  prepareUnsignedStealthSignPackage,
  signPrebuiltClaimStealthInstruction,
  signPrebuiltRegisterStealthInstruction,
  signPrebuiltSendStealthInstruction,
  signUnsignedStealthPackageInWallet,
  simulateStealthInstructionBeforeWallet,
  submitSignedStealthTransaction,
} from './stealthLightReadyRunner.ts';

export {
  simulateStealthInstructionBeforeWallet,
  signPrebuiltRegisterStealthInstruction,
  signPrebuiltSendStealthInstruction,
  signPrebuiltClaimStealthInstruction,
  prepareUnsignedStealthSignPackage,
  signUnsignedStealthPackageInWallet,
  submitSignedStealthTransaction,
};
import {
  resolveAndCheckStealthTokenAccounts,
  resolveStealthTokenAccounts,
} from './stealthTokenAccounts.ts';
import type { StealthWalletExecutor, RunInstructionResult } from './stealthTransactionRunner.ts';
import {
  formatClaimTxTransferSummaryForUser,
  summarizeClaimTokenTransferFromConfirmedTx,
} from './claimTxTransferSummary.ts';

export const STEALTH_TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;

export type StealthLightRuntimeUrls = {
  rpcUrl: string;
  photonUrl: string;
  proverUrl: string;
  /** Photon/indexer; on devnet defaults to photonUrl (Helius ZK compression). */
  indexerUrl?: string;
};

export function resolveStealthLightRuntimeUrls(settings: {
  cluster: SupportedCluster;
  solanaRpcUrl?: string;
  lightPhotonUrl?: string;
  lightProverUrl?: string;
}): StealthLightRuntimeUrls {
  if (settings.cluster === 'localnet') {
    return {
      rpcUrl:
        settings.solanaRpcUrl?.trim() ||
        'http://127.0.0.1:8899',
      photonUrl:
        settings.lightPhotonUrl?.trim() ||
        'http://127.0.0.1:8784',
      proverUrl:
        settings.lightProverUrl?.trim() ||
        'http://127.0.0.1:3001',
    };
  }

  if (settings.cluster === 'devnet') {
    const customProver = settings.lightProverUrl?.trim();
    const compressionEndpoint = resolvePierronDevnetCompressionEndpoint(settings);

    return {
      rpcUrl: compressionEndpoint,
      photonUrl: compressionEndpoint,
      proverUrl: customProver || compressionEndpoint,
      indexerUrl: compressionEndpoint,
    };
  }

  throw new Error(
    `Stealth on-chain jest wspierany tylko na localnet/devnet (obecny: ${settings.cluster}).`
  );
}

export async function ensureStealthTokenAccountsWithWallet(params: {
  connection: Connection;
  wallet: StealthWalletExecutor;
  mint: PublicKey;
  sender: PublicKey;
  claimer?: PublicKey;
  cluster: SupportedCluster;
}): Promise<{
  senderToken: PublicKey;
  claimerToken: PublicKey;
  stealthToken: PublicKey;
}> {
  setCurrentCluster(params.cluster);
  const programId = getPierronStealthProgramId(params.cluster);
  const resolved = resolveStealthTokenAccounts({
    programId,
    mint: params.mint,
    sender: params.sender,
    claimer: params.claimer,
    tokenProgramId: STEALTH_TOKEN_PROGRAM_ID,
    associatedTokenProgramId: ASSOCIATED_TOKEN_PROGRAM_ID,
  });

  const { existence } = await resolveAndCheckStealthTokenAccounts({
    connection: params.connection,
    programId,
    mint: params.mint,
    sender: params.sender,
    claimer: params.claimer,
    tokenProgramId: STEALTH_TOKEN_PROGRAM_ID,
    associatedTokenProgramId: ASSOCIATED_TOKEN_PROGRAM_ID,
  });

  const tx = new Transaction();
  const payer = params.wallet.payer;

  if (!existence.senderToken.exists) {
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        resolved.senderToken,
        params.sender,
        params.mint,
        STEALTH_TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  const claimerOwner = params.claimer ?? params.sender;
  if (!existence.claimerToken.exists) {
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        resolved.claimerToken,
        claimerOwner,
        params.mint,
        STEALTH_TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  // Protocol stealth vault ATA (PDA authority). Missing after stealth program_id rotation.
  if (!existence.stealthToken.exists) {
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        resolved.stealthToken,
        resolved.stealthAuthority,
        params.mint,
        STEALTH_TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  if (tx.instructions.length > 0) {
    const { blockhash, lastValidBlockHeight } =
      await params.connection.getLatestBlockhash('confirmed');
    tx.feePayer = payer;
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;

    const signed = await params.wallet.signTransaction(tx);
    const sig = await params.connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: true,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });
    const confirmation = await confirmSignatureViaHttp(params.connection, sig, {
      timeoutMs: 45_000,
      gracePeriodMs: 15_000,
      minConfirmation: 'confirmed',
    });
    if (!confirmation.ok && 'err' in confirmation) {
      throw new Error(`ATA setup tx failed: ${JSON.stringify(confirmation.err)}`);
    }
  }

  return {
    senderToken: resolved.senderToken,
    claimerToken: resolved.claimerToken,
    stealthToken: resolved.stealthToken,
  };
}

export async function prepareRegisterStealthLightBundle(params: {
  owner: PublicKey;
  cluster: SupportedCluster;
  lightAddressSeed?: Uint8Array;
  outputTreeIndex?: number;
}): Promise<RegisterLightBundle> {
  setCurrentCluster(params.cluster);
  return buildRegisterLightBundle({
    owner: params.owner,
    cluster: params.cluster,
    lightAddressSeed: params.lightAddressSeed,
    outputTreeIndex: resolveStealthOutputTreeIndex({
      cluster: params.cluster,
      explicit: params.outputTreeIndex,
      flow: 'register',
    }),
  });
}

export async function buildRegisterStealthInstructionFromPreparedBundle(params: {
  owner: PublicKey;
  cluster: SupportedCluster;
  bundle: RegisterLightBundle;
  lightAddressSeed?: Uint8Array;
  outputTreeIndex?: number;
}): Promise<BuiltStealthInstructionResult> {
  setCurrentCluster(params.cluster);
  return createRegisterStealthInstructionFromLightBundle({
    owner: params.owner,
    bundle: params.bundle,
    cluster: params.cluster,
    lightAddressSeed: params.lightAddressSeed,
    lightAddressSeedBytes: params.lightAddressSeed,
    outputTreeIndex: resolveStealthOutputTreeIndex({
      cluster: params.cluster,
      explicit: params.outputTreeIndex,
      flow: 'register',
    }),
  });
}

export async function executeRegisterStealthOnChain(params: {
  connection: Connection;
  wallet: StealthWalletExecutor;
  owner: PublicKey;
  cluster: SupportedCluster;
  lightAddressSeed?: Uint8Array;
  outputTreeIndex?: number;
  /** Pre-built outside wallet session (mobile: avoids long Helius work inside MWA transact). */
  bundle?: RegisterLightBundle;
  /** Instruction built outside wallet — tylko podpis w Phantom. */
  prebuiltInstruction?: BuiltStealthInstructionResult;
  /** Symulacja wykonana przed sesją MWA (register mobile). */
  skipPreSendSimulation?: boolean;
  onTransactionSubmitted?: (signature: string) => void;
}): Promise<RunInstructionResult> {
  setCurrentCluster(params.cluster);

  if (params.prebuiltInstruction) {
    return sendPrebuiltRegisterStealthInstruction(params.connection, params.wallet, {
      built: params.prebuiltInstruction,
      onTransactionSubmitted: params.onTransactionSubmitted,
      skipPreSendSimulation: params.skipPreSendSimulation,
    });
  }

  const bundle =
    params.bundle ??
    (await prepareRegisterStealthLightBundle({
      owner: params.owner,
      cluster: params.cluster,
      lightAddressSeed: params.lightAddressSeed,
      outputTreeIndex: params.outputTreeIndex,
    }));

  return sendRegisterStealthFromLightBundle(params.connection, params.wallet, {
    owner: params.owner,
    bundle,
    cluster: params.cluster,
    lightAddressSeed: params.lightAddressSeed,
    lightAddressSeedBytes: params.lightAddressSeed,
    outputTreeIndex: resolveStealthOutputTreeIndex({
      cluster: params.cluster,
      explicit: params.outputTreeIndex,
      flow: 'register',
    }),
    onTransactionSubmitted: params.onTransactionSubmitted,
  });
}

export async function prepareSendStealthBuiltInstruction(params: {
  connection: Connection;
  wallet: StealthWalletExecutor;
  sender: PublicKey;
  mint: PublicKey;
  amount: bigint;
  stealthAddress: PublicKey;
  lightAddressSeed: Uint8Array;
  recipientSpendKey: Uint8Array;
  recipientViewKey: Uint8Array;
  /** Owner stealth meta odbiorcy — wymagany (wiąże claim on-chain). */
  intendedClaimer: PublicKey | string;
  recipientBundle?: unknown;
  cluster: SupportedCluster;
  outputTreeIndex?: number;
}): Promise<BuiltStealthInstructionResult> {
  setCurrentCluster(params.cluster);

  const outputTreeIndex = resolveStealthOutputTreeIndex({
    cluster: params.cluster,
    explicit: params.outputTreeIndex,
    flow: 'send',
  });

  const tokenAccounts = await ensureStealthTokenAccountsWithWallet({
    connection: params.connection,
    wallet: params.wallet,
    mint: params.mint,
    sender: params.sender,
    cluster: params.cluster,
  });

  const bundle = await buildSendLightBundle({
    sender: params.sender,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    cluster: params.cluster,
    outputTreeIndex,
  });

  return createSendStealthInstructionFromLightBundle({
    sender: params.sender,
    mint: params.mint,
    senderToken: tokenAccounts.senderToken,
    stealthToken: tokenAccounts.stealthToken,
    tokenProgram: STEALTH_TOKEN_PROGRAM_ID,
    amount: params.amount,
    bundle,
    cluster: params.cluster,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    recipientSpendKey: params.recipientSpendKey,
    recipientViewKey: params.recipientViewKey,
    intendedClaimer: params.intendedClaimer,
    recipientBundle: params.recipientBundle,
    outputTreeIndex,
  });
}

export async function executeSendStealthOnChain(params: {
  connection: Connection;
  wallet: StealthWalletExecutor;
  sender: PublicKey;
  mint: PublicKey;
  amount: bigint;
  stealthAddress: PublicKey;
  lightAddressSeed: Uint8Array;
  recipientSpendKey: Uint8Array;
  recipientViewKey: Uint8Array;
  /** Owner stealth meta odbiorcy — wymagany (wiąże claim on-chain). */
  intendedClaimer: PublicKey | string;
  recipientBundle?: unknown;
  cluster: SupportedCluster;
  outputTreeIndex?: number;
}): Promise<RunInstructionResult> {
  setCurrentCluster(params.cluster);

  const outputTreeIndex = resolveStealthOutputTreeIndex({
    cluster: params.cluster,
    explicit: params.outputTreeIndex,
    flow: 'send',
  });

  const tokenAccounts = await ensureStealthTokenAccountsWithWallet({
    connection: params.connection,
    wallet: params.wallet,
    mint: params.mint,
    sender: params.sender,
    cluster: params.cluster,
  });

  const bundle = await buildSendLightBundle({
    sender: params.sender,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    cluster: params.cluster,
    outputTreeIndex,
  });

  const sendResult = await sendSendStealthFromLightBundle(params.connection, params.wallet, {
    sender: params.sender,
    mint: params.mint,
    senderToken: tokenAccounts.senderToken,
    stealthToken: tokenAccounts.stealthToken,
    tokenProgram: STEALTH_TOKEN_PROGRAM_ID,
    amount: params.amount,
    bundle,
    cluster: params.cluster,
    stealthAddress: params.stealthAddress,
    lightAddressSeed: params.lightAddressSeed,
    recipientSpendKey: params.recipientSpendKey,
    recipientViewKey: params.recipientViewKey,
    intendedClaimer: params.intendedClaimer,
    recipientBundle: params.recipientBundle,
    outputTreeIndex,
  });

  let notificationStealthAddress = params.stealthAddress.toBase58();
  if (sendResult.ok) {
    try {
      const indexedAfter = await resolveIndexedSendPaymentAddress({
        preparedStealthAddress: params.stealthAddress,
        proofOwner: params.sender,
        lightAddressSeed: params.lightAddressSeed,
        runtime: getLightLocalRuntimeOverride() ?? undefined,
        cluster: params.cluster,
      });
      notificationStealthAddress = indexedAfter.address.toBase58();
    } catch {
      // fallback: adres z prepare
    }
  }

  return {
    ...sendResult,
    notificationStealthAddress,
  };
}

/**
 * Photon discovery + build claim ix **poza** sesją MWA.
 * Bez seeda (32 B) od razu błąd — inaczej 36× poll wisi w Phantom.
 */
export async function prepareClaimStealthBuiltInstruction(params: {
  connection: Connection;
  claimer: PublicKey;
  mint: PublicKey;
  stealthAddress: PublicKey;
  metaOwner: PublicKey;
  registerCompressedAddress?: PublicKey;
  lightAddressSeed?: Uint8Array;
  sendProofOwner?: PublicKey;
  expectedPaymentAmount?: string;
  expectedSenderHash?: string;
  cluster: SupportedCluster;
  /** Mobile: krótszy poll (domyślnie 12×2.5s z seedem). */
  maxPhotonAttempts?: number;
  photonDelayMs?: number;
}): Promise<{
  built: BuiltStealthInstructionResult;
  stealthAddress: PublicKey;
  claimValidityProofSourceHashes: string[];
  claimerHintCompressedAddress?: PublicKey;
}> {
  setCurrentCluster(params.cluster);

  if (!params.lightAddressSeed || params.lightAddressSeed.length !== 32) {
    throw new Error(
      [
        'Brak lightAddressSeedHex (32 B) w powiadomieniu o płatności.',
        'Bez seeda claim nie wyliczy adresu płatności w Photon.',
        'Na nadawcy: po Send OK użyj „Pokaż / zapisz QR powiadomienia” albo skopiuj JSON ze seedem (nie z samego prepare).',
        'Na odbiorcy: wklej / zeskanuj to powiadomienie ponownie, ewentualnie wklej seed hex ręcznie.',
      ].join(' ')
    );
  }

  const runtime: PartialLightLocalRuntimeConfig | undefined =
    getLightLocalRuntimeOverride() ?? undefined;

  const photonRuntime: PartialLightLocalRuntimeConfig = (() => {
    const endpoint = resolvePierronDevnetCompressionEndpoint({});
    const base = runtime ?? {};
    const photon =
      base.photonUrl || base.indexerUrl || base.rpcUrl || endpoint;
    // Nigdy nie polluj lokalnego Photona na telefonie / gdy override wskazuje 127.0.0.1.
    const safe =
      /127\.0\.0\.1|localhost/i.test(photon) ? endpoint : photon;
    return {
      ...base,
      photonUrl: safe,
      indexerUrl: safe,
      rpcUrl: base.rpcUrl && !/127\.0\.0\.1|localhost/i.test(base.rpcUrl)
        ? base.rpcUrl
        : safe,
    };
  })();

  // Jeden skan programu → meta+payment. Bez tego mobile pali 45s na seed/bootstrap/poll.
  const leafHints = await resolveClaimPhotonLeafHints({
    claimer: params.claimer,
    metaOwner: params.metaOwner,
    registerCompressedAddress: params.registerCompressedAddress,
    expectedPaymentAmount: params.expectedPaymentAmount,
    expectedSenderHash: params.expectedSenderHash,
    preferredStealthAddress: params.stealthAddress,
    runtime: photonRuntime,
  });
  if (leafHints.unclaimedForClaimer === 0) {
    throw new Error(
      [
        `Brak nieodebranego leafa płatności dla claimera ${params.claimer.toBase58().slice(0, 8)}… (Photon: ${leafHints.totalPayments} płatności łącznie, 0 dla Ciebie).`,
        'To nie jest wolna indeksacja — Send na nadawcy musi użyć recipient bundle ODBIORCY (Samsung), nie własnego register Sony.',
        'Na Sony: wklej bundle z Samsunga → Real send stealth OK → świeże powiadomienie ze seedem → Claim na Samsungu.',
      ].join(' ')
    );
  }

  let hints: {
    claimValidityProofSourceHashes: string[];
    claimerHintCompressedAddress?: PublicKey;
    resolvedStealthAddress?: PublicKey;
    notes: string[];
  };

  if (leafHints.metaHash && leafHints.paymentHash) {
    hints = {
      claimValidityProofSourceHashes: [
        leafHints.metaHash,
        leafHints.paymentHash,
      ],
      claimerHintCompressedAddress: leafHints.metaPhotonAddress
        ? new PublicKey(leafHints.metaPhotonAddress)
        : params.registerCompressedAddress,
      resolvedStealthAddress: leafHints.paymentStealthAddress
        ? new PublicKey(leafHints.paymentStealthAddress)
        : undefined,
      notes: [
        `fast-path Photon: meta+payment w 1 skanie (unclaimed=${leafHints.unclaimedForClaimer})`,
      ],
    };
  } else {
    const fallback = await discoverClaimLightBundleHints({
      metaOwner: params.metaOwner,
      stealthAddress: params.stealthAddress,
      registerCompressedAddress: params.registerCompressedAddress,
      lightAddressSeed: params.lightAddressSeed,
      sendProofOwner: params.sendProofOwner,
      expectedPaymentAmount: params.expectedPaymentAmount,
      expectedSenderHash: params.expectedSenderHash,
      intendedClaimer: params.claimer,
      preferredPaymentAddresses: leafHints.sampleStealthAddresses,
      runtime: photonRuntime,
      cluster: params.cluster,
      maxAttempts: Math.min(
        params.maxPhotonAttempts ?? 3,
        params.cluster === 'devnet' ? 3 : 4
      ),
      delayMs: Math.min(params.photonDelayMs ?? 800, 800),
      maxHeavyRediscoveryRuns: 0,
      skipProgramScan: false,
      skipLongPaymentWait: true,
    });
    hints = fallback;
  }

  if (hints.claimValidityProofSourceHashes.length < 2) {
    const sameHashNote = hints.notes.find((n) => n.includes('ten sam hash'));
    const paymentDiag =
      leafHints.unclaimedForClaimer > 0
        ? `Photon widzi ${leafHints.unclaimedForClaimer} nieodebranych płatności (metaHash=${leafHints.metaHash ? 'ok' : 'brak'}, paymentHash=${leafHints.paymentHash ? 'ok' : 'brak'}).`
        : '';
    throw new Error(
      [
        paymentDiag ||
          'Indeks Photon nie ma jeszcze pełnych danych do claim (meta + płatność).',
        !paymentDiag && sameHashNote
          ? 'Meta i płatność wskazywały ten sam skompresowany leaf — poczekaj 30–90 s i spróbuj ponownie.'
          : !paymentDiag
            ? 'Poczekaj 30–90 s po send on-chain i spróbuj ponownie (bez otwierania portfela).'
            : '',
        ...hints.notes.slice(0, 6),
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  const stealthAddress = hints.resolvedStealthAddress ?? params.stealthAddress;

  const programId = getPierronStealthProgramId(params.cluster);
  const resolved = resolveStealthTokenAccounts({
    programId,
    mint: params.mint,
    sender: params.claimer,
    claimer: params.claimer,
    tokenProgramId: STEALTH_TOKEN_PROGRAM_ID,
    associatedTokenProgramId: ASSOCIATED_TOKEN_PROGRAM_ID,
  });

  const bundle = await buildClaimLightBundle({
    claimer: params.claimer,
    metaOwner: params.metaOwner,
    stealthAddress,
    cluster: params.cluster,
    claimValidityProofSourceHashes: hints.claimValidityProofSourceHashes,
    claimerHintCompressedAddress: hints.claimerHintCompressedAddress,
  });

  const buildOnce = () =>
    createClaimStealthInstructionFromLightBundle({
      claimer: params.claimer,
      mint: params.mint,
      stealthToken: resolved.stealthToken,
      claimerToken: resolved.claimerToken,
      tokenProgram: STEALTH_TOKEN_PROGRAM_ID,
      bundle,
      cluster: params.cluster,
      metaOwner: params.metaOwner,
      stealthAddress,
      claimValidityProofSourceHashes: hints.claimValidityProofSourceHashes,
      lightRuntime: photonRuntime,
      claimerHintCompressedAddress: hints.claimerHintCompressedAddress,
    });

  let built: Awaited<ReturnType<typeof createClaimStealthInstructionFromLightBundle>> | undefined;
  try {
    built = await buildOnce();
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    // Photon data:null — kilka dodatkowych prób (discovery już czekało; leaf `data` bywa później).
    if (!/data:null|nie zwraca pełnych danych leaf|StealthMeta|StealthPayment/i.test(msg)) {
      throw err;
    }
    let lastErr: unknown = err;
    for (let i = 0; i < 2; i += 1) {
      await new Promise((r) => setTimeout(r, 3_000));
      try {
        built = await buildOnce();
        lastErr = null;
        break;
      } catch (retryErr) {
        lastErr = retryErr;
        const retryMsg = String((retryErr as Error)?.message ?? retryErr);
        if (
          !/data:null|nie zwraca pełnych danych leaf|StealthMeta|StealthPayment/i.test(retryMsg)
        ) {
          throw retryErr;
        }
      }
    }
    if (lastErr || !built) {
      throw lastErr ?? err;
    }
  }

  return {
    built,
    stealthAddress,
    claimValidityProofSourceHashes: hints.claimValidityProofSourceHashes,
    claimerHintCompressedAddress: hints.claimerHintCompressedAddress,
  };
}

export async function executeClaimStealthOnChain(params: {
  connection: Connection;
  wallet: StealthWalletExecutor;
  claimer: PublicKey;
  mint: PublicKey;
  stealthAddress: PublicKey;
  metaOwner: PublicKey;
  registerCompressedAddress?: PublicKey;
  lightAddressSeed?: Uint8Array;
  /** Nadawca send (z powiadomienia) — devnet Photon newAddressProof. */
  sendProofOwner?: PublicKey;
  expectedPaymentAmount?: string;
  expectedSenderHash?: string;
  cluster: SupportedCluster;
}): Promise<RunInstructionResult> {
  setCurrentCluster(params.cluster);

  const tokenAccounts = await ensureStealthTokenAccountsWithWallet({
    connection: params.connection,
    wallet: params.wallet,
    mint: params.mint,
    sender: params.claimer,
    claimer: params.claimer,
    cluster: params.cluster,
  });

  const runtime: PartialLightLocalRuntimeConfig | undefined =
    getLightLocalRuntimeOverride() ?? undefined;

  const hasSeed =
    params.lightAddressSeed != null && params.lightAddressSeed.length === 32;

  if (!hasSeed) {
    throw new Error(
      [
        'Brak lightAddressSeedHex (32 B) — nie otwieram portfela.',
        'Wklej pełne powiadomienie po Send OK (ze seedem) albo seed hex ręcznie.',
      ].join(' ')
    );
  }

  const endpoint = resolvePierronDevnetCompressionEndpoint({});
  const photonRuntime: PartialLightLocalRuntimeConfig = (() => {
    const base = runtime ?? {};
    const photon = base.photonUrl || base.indexerUrl || base.rpcUrl || endpoint;
    const safe = /127\.0\.0\.1|localhost/i.test(photon) ? endpoint : photon;
    return {
      ...base,
      photonUrl: safe,
      indexerUrl: safe,
      rpcUrl:
        base.rpcUrl && !/127\.0\.0\.1|localhost/i.test(base.rpcUrl)
          ? base.rpcUrl
          : safe,
    };
  })();

  const leafHints = await resolveClaimPhotonLeafHints({
    claimer: params.claimer,
    metaOwner: params.metaOwner,
    registerCompressedAddress: params.registerCompressedAddress,
    expectedPaymentAmount: params.expectedPaymentAmount,
    expectedSenderHash: params.expectedSenderHash,
    preferredStealthAddress: params.stealthAddress,
    runtime: photonRuntime,
  });
  if (leafHints.unclaimedForClaimer === 0) {
    throw new Error(
      [
        `Brak nieodebranego leafa płatności dla claimera ${params.claimer.toBase58().slice(0, 8)}… (Photon: ${leafHints.totalPayments} płatności łącznie).`,
        'Send na nadawcy musi użyć recipient bundle ODBIORCY — potem świeże powiadomienie ze seedem.',
      ].join(' ')
    );
  }

  let hints: {
    claimValidityProofSourceHashes: string[];
    claimerHintCompressedAddress?: PublicKey;
    resolvedStealthAddress?: PublicKey;
    notes: string[];
  };

  if (leafHints.metaHash && leafHints.paymentHash) {
    hints = {
      claimValidityProofSourceHashes: [
        leafHints.metaHash,
        leafHints.paymentHash,
      ],
      claimerHintCompressedAddress: leafHints.metaPhotonAddress
        ? new PublicKey(leafHints.metaPhotonAddress)
        : params.registerCompressedAddress,
      resolvedStealthAddress: leafHints.paymentStealthAddress
        ? new PublicKey(leafHints.paymentStealthAddress)
        : undefined,
      notes: ['fast-path Photon: meta+payment w 1 skanie'],
    };
  } else {
    hints = await discoverClaimLightBundleHints({
      metaOwner: params.metaOwner,
      stealthAddress: params.stealthAddress,
      registerCompressedAddress: params.registerCompressedAddress,
      lightAddressSeed: params.lightAddressSeed,
      sendProofOwner: params.sendProofOwner,
      expectedPaymentAmount: params.expectedPaymentAmount,
      expectedSenderHash: params.expectedSenderHash,
      intendedClaimer: params.claimer,
      preferredPaymentAddresses: leafHints.sampleStealthAddresses,
      runtime: photonRuntime,
      cluster: params.cluster,
      maxAttempts: params.cluster === 'devnet' ? 3 : 4,
      delayMs: 800,
      maxHeavyRediscoveryRuns: 0,
      skipProgramScan: false,
      skipLongPaymentWait: true,
    });
  }

  if (hints.claimValidityProofSourceHashes.length < 2) {
    const sameHashNote = hints.notes.find((n) =>
      n.includes('ten sam hash')
    );
    throw new Error(
      [
        leafHints.unclaimedForClaimer > 0
          ? `Photon widzi ${leafHints.unclaimedForClaimer} płatności, ale brak pełnych hash (meta=${leafHints.metaHash ? 'ok' : 'brak'}, pay=${leafHints.paymentHash ? 'ok' : 'brak'}).`
          : 'Indeks Photon nie ma jeszcze pełnych danych do claim (meta + płatność).',
        sameHashNote
          ? 'Meta i płatność wskazywały ten sam skompresowany leaf — poczekaj na indeks płatności pod adresem z powiadomienia.'
          : 'Poczekaj 30–90 s po send on-chain i spróbuj ponownie.',
        ...hints.notes.slice(0, 8),
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  const stealthAddress = hints.resolvedStealthAddress ?? params.stealthAddress;

  const bundleParams = {
    claimer: params.claimer,
    metaOwner: params.metaOwner,
    stealthAddress,
    cluster: params.cluster,
    claimValidityProofSourceHashes: hints.claimValidityProofSourceHashes,
    claimerHintCompressedAddress: hints.claimerHintCompressedAddress,
  };

  const bundle = await buildClaimLightBundle(bundleParams);

  const claimResult = await sendClaimStealthFromLightBundle(params.connection, params.wallet, {
    claimer: params.claimer,
    mint: params.mint,
    stealthToken: tokenAccounts.stealthToken,
    claimerToken: tokenAccounts.claimerToken,
    tokenProgram: STEALTH_TOKEN_PROGRAM_ID,
    bundle,
    cluster: params.cluster,
    metaOwner: params.metaOwner,
    stealthAddress,
    claimValidityProofSourceHashes: hints.claimValidityProofSourceHashes,
    lightRuntime: photonRuntime,
    claimerHintCompressedAddress: hints.claimerHintCompressedAddress,
  });

  if (claimResult.ok && claimResult.signature) {
    try {
      const transfer = await summarizeClaimTokenTransferFromConfirmedTx({
        connection: params.connection,
        signature: claimResult.signature,
        claimer: params.claimer,
      });
      if (transfer) {
        return {
          ...claimResult,
          claimTransferSummary: formatClaimTxTransferSummaryForUser(transfer),
        };
      }
    } catch {
      // best-effort UX hint
    }
  }

  return claimResult;
}
