import { PublicKey } from '@solana/web3.js';

import {
  getPierronStealthProgramId,
  type SupportedCluster,
} from '../core/programIds.ts';
import type { ClaimLightBundle } from '../light/lightClient.ts';
import {
  LIGHT_CANONICAL_EXTERNAL_INDEX,
} from '../light/lightClient.ts';
import {
  prepareClaimStealthExecution,
  prepareRegisterStealthExecution,
  prepareSendStealthExecution,
  type ClaimExecutionSource,
  type ClaimStealthExecution,
  type PrepareSendStealthExecutionParams,
} from './stealthActions.ts';
import type { SendRecipientMode } from '../stealth-base/stealthPayloads.ts';

export type RegisterStealthExecutionPlan = {
  kind: 'register_stealth';
  programId: string;
  contract: 'canonical-register-flow';
  readyForInstructionBuild: boolean;
  readyForOnchainExecution: boolean;
  accounts: {
    owner: string;
  };
  args: {
    outputTreeIndexInput: number;
    outputTreeIndexEffective?: number;
    nonce: string;
    registeredAt: string;
    transactionCount: string;
    spendPublicKey: number[];
    viewPublicKey: number[];
    provisionalRegisterAddressSeed: number[];
  };
  indexContract: {
    canonicalExternal: {
      merkleTree: number;
      addressQueue: number;
      stateQueue: number;
      stateTree: number;
      address: number;
    };
  };
  debug?: {
    provisionalSeedSource: 'lightAddressSeedBytes_preferred';
  };
  notes: string[];
  missing: string[];
};

export type SendStealthExecutionPlan = {
  kind: 'send_stealth';
  programId: string;
  contract: 'canonical-send-flow';
  readyForInstructionBuild: boolean;
  readyForOnchainExecution: boolean;
  accounts: {
    sender: string;
    mint: string;
    stealthAddress: string;
    stealthAuthority: string;
  };
  args: {
    outputTreeIndexInput: number;
    outputTreeIndexEffective?: number;
    amount: string;
    senderHash: string;
    createdAt: string;
    claimed: boolean;
    intendedClaimer: string;
    ephemeralPublicKey: number[];
    recipientSpendKey: number[];
    recipientViewKey: number[];
    bump: number;
    canonicalLightAddressSeed: number[];
  };
  debug?: {
    canonicalSeedSource: 'lightAddressSeedBytes_preferred';
  };
  indexContract: {
    canonicalExternal: {
      merkleTree: number;
      addressQueue: number;
      stateQueue: number;
      stateTree: number;
      address: number;
    };
  };
  light: {
    proofReady: boolean;
    addressTreeInfoReady: boolean;
    newAddressReady: boolean;
  };
  notes: string[];
  missing: string[];
};

export type ClaimStealthExecutionPlan = {
  kind: 'claim_stealth';
  programId: string;
  contract: 'claim-flow';
  readyForInstructionBuild: boolean;
  readyForOnchainExecution: boolean;
  source: ClaimExecutionSource;
  accounts: {
    claimer: string;
    mint: string;
    metaOwner?: string;
    stealthAddress?: string;
    stealthAuthority?: string;
  };
  args: {
    bump?: number;
    amount?: string;
    claimerMetaAccount?: {
      owner: string;
      nonce: string;
      registeredAt: string;
      transactionCount: string;
    };
    paymentAccount?: {
      stealthAddress: string;
      amount: string;
      createdAt: string;
      claimed: boolean;
      senderHash: string;
      intendedClaimer: string;
    };
  };
  light: {
    proofReady: boolean;
    claimerMetaReady: boolean;
    paymentMetaReady: boolean;
    remainingAccountsReady: boolean;
    stealthAuthorityBumpReady: boolean;
  };
  notes: string[];
  missing: string[];
};

function parseEffectiveOutputTreeIndex(notes: string[] | undefined): number | undefined {
  if (!Array.isArray(notes)) return undefined;

  const line = notes.find((item) =>
    String(item).startsWith('registerOutputTreeIndexEffective:') ||
    String(item).startsWith('sendOutputTreeIndexEffective:')
  );

  if (!line) return undefined;

  const raw = String(line).split(':').slice(1).join(':').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

export async function buildRegisterStealthExecutionPlan(params: {
  owner: PublicKey;
  outputTreeIndex?: number;
  cluster?: SupportedCluster;
}): Promise<RegisterStealthExecutionPlan> {
  const execution = await prepareRegisterStealthExecution(params);
  const programId = getPierronStealthProgramId(params.cluster);

  const readyFlags = execution.ready as {
    local: boolean;
    onchain?: boolean;
  };

  const readyForInstructionBuild = readyFlags.local;
  const readyForOnchainExecution =
    typeof readyFlags.onchain === 'boolean'
      ? readyFlags.onchain
      : readyForInstructionBuild;

  const outputTreeIndexEffective = parseEffectiveOutputTreeIndex(execution.notes);

  return {
    kind: 'register_stealth',
    programId: programId.toBase58(),
    contract: 'canonical-register-flow',
    readyForInstructionBuild,
    readyForOnchainExecution,
    accounts: {
      owner: execution.payload.owner,
    },
    args: {
      outputTreeIndexInput: execution.payload.outputTreeIndex,
      ...(typeof outputTreeIndexEffective === 'number'
        ? { outputTreeIndexEffective }
        : {}),
      nonce: execution.payload.nonce,
      registeredAt: execution.payload.registeredAt,
      transactionCount: execution.payload.transactionCount,
      spendPublicKey: execution.payload.spendPublicKey,
      viewPublicKey: execution.payload.viewPublicKey,
      provisionalRegisterAddressSeed:
        execution.payload.provisionalRegisterAddressSeed,
    },
    indexContract: {
      canonicalExternal: {
        merkleTree: LIGHT_CANONICAL_EXTERNAL_INDEX.register.merkleTree,
        addressQueue: LIGHT_CANONICAL_EXTERNAL_INDEX.register.addressQueue,
        stateQueue: LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateQueue,
        stateTree: LIGHT_CANONICAL_EXTERNAL_INDEX.register.stateTree,
        address: LIGHT_CANONICAL_EXTERNAL_INDEX.register.address,
      },
    },
    debug: {
      provisionalSeedSource: 'lightAddressSeedBytes_preferred',
    },
    notes: execution.notes,
    missing: readyForInstructionBuild ? [] : ['Brakuje lokalnych danych register_stealth'],
  };
}

export async function buildSendStealthExecutionPlan(
  params: PrepareSendStealthExecutionParams
): Promise<SendStealthExecutionPlan> {
  const execution = await prepareSendStealthExecution(params);
  const programId = getPierronStealthProgramId(
    typeof params.cluster === 'string' ? (params.cluster as SupportedCluster) : undefined
  );

  const outputTreeIndexEffective = parseEffectiveOutputTreeIndex(execution.notes);

  return {
    kind: 'send_stealth',
    programId: programId.toBase58(),
    contract: 'canonical-send-flow',
    readyForInstructionBuild: execution.ready.local,
    readyForOnchainExecution: execution.ready.onchain,
    accounts: {
      sender: execution.payload.sender,
      mint: execution.payload.mint,
      stealthAddress: execution.payload.stealthAddress,
      stealthAuthority: execution.escrow.stealthAuthority,
    },
    args: {
      outputTreeIndexInput: execution.payload.outputTreeIndex,
      ...(typeof outputTreeIndexEffective === 'number'
        ? { outputTreeIndexEffective }
        : {}),
      amount: execution.payload.amount,
      senderHash: execution.payload.paymentAccount.senderHash,
      createdAt: execution.payload.paymentAccount.createdAt,
      claimed: execution.payload.paymentAccount.claimed,
      intendedClaimer: execution.payload.paymentAccount.intendedClaimer,
      ephemeralPublicKey: execution.payload.ephemeralPublicKey,
      recipientSpendKey: execution.payload.recipientSpendKey,
      recipientViewKey: execution.payload.recipientViewKey,
      bump: execution.escrow.bump,
      canonicalLightAddressSeed: execution.payload.canonicalLightAddressSeed,
    },
    debug: {
      canonicalSeedSource: 'lightAddressSeedBytes_preferred',
    },
    indexContract: {
      canonicalExternal: {
        merkleTree: LIGHT_CANONICAL_EXTERNAL_INDEX.send.merkleTree,
        addressQueue: LIGHT_CANONICAL_EXTERNAL_INDEX.send.addressQueue,
        stateQueue: LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateQueue,
        stateTree: LIGHT_CANONICAL_EXTERNAL_INDEX.send.stateTree,
        address: LIGHT_CANONICAL_EXTERNAL_INDEX.send.address,
      },
    },
    light: {
      proofReady: execution.proof.proofReady,
      addressTreeInfoReady: execution.proof.addressTreeInfoReady,
      newAddressReady: execution.proof.newAddressReady,
    },
    notes: execution.notes,
    missing: execution.missing,
  };
}

export function claimExecutionToPlan(
  execution: ClaimStealthExecution,
  cluster?: SupportedCluster
): ClaimStealthExecutionPlan {
  const programId = getPierronStealthProgramId(cluster);

  return {
    kind: 'claim_stealth',
    programId: programId.toBase58(),
    contract: 'claim-flow',
    readyForInstructionBuild: execution.ready.local,
    readyForOnchainExecution: execution.ready.onchain,
    source: execution.localData.source,
    accounts: {
      claimer: execution.localData.claimer,
      mint: execution.localData.mint,
      metaOwner: execution.localData.metaOwner,
      stealthAddress: execution.localData.claimableStealthAddress,
      stealthAuthority: execution.escrow?.stealthAuthority,
    },
    args: {
      bump: execution.escrow?.bump,
      amount: execution.localData.claimableAmount,
      claimerMetaAccount: execution.claimerMetaAccount,
      paymentAccount: execution.paymentAccount,
    },
    light: {
      proofReady: execution.proof.proofReady,
      claimerMetaReady: execution.proof.claimerMetaReady,
      paymentMetaReady: execution.proof.paymentMetaReady,
      remainingAccountsReady: execution.proof.remainingAccountsReady,
      stealthAuthorityBumpReady: execution.proof.stealthAuthorityBumpReady,
    },
    notes: execution.notes,
    missing: execution.missing,
  };
}

export async function buildClaimStealthExecutionPlan(params: {
  claimer: PublicKey;
  mint: PublicKey;
  metaOwner?: PublicKey;
  stealthAddress?: PublicKey;
  amount?: bigint | string;
  createdAt?: bigint | string;
  claimed?: boolean;
  senderHash?: bigint | string;
  recipientMode?: SendRecipientMode;
  bundle?: ClaimLightBundle;
  allowStorageFallback?: boolean;
  cluster?: SupportedCluster;
}): Promise<ClaimStealthExecutionPlan> {
  const execution = await prepareClaimStealthExecution(params);
  return claimExecutionToPlan(execution, params.cluster);
}
