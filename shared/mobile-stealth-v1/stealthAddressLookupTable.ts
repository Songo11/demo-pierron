import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import type { SupportedCluster } from '../core/programIds.ts';
import {
  getConfiguredRedistributionVault,
  getConfiguredStealthSendLookupTable,
  getPierronProgramId,
  getPierronStealthProgramId,
  getPierronTransferHookProgramId,
  getConfiguredTokenMint,
} from '../core/programIds.ts';
import { LOCALNET_LIGHT_ACCOUNTS } from '../light/lightCanonicalConfig.ts';
import { deriveStealthAuthorityAndVault } from '../stealth-base/stealthPda.ts';

const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

const LIGHT_SYSTEM_PROGRAM_ID = new PublicKey(
  'SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7'
);

const REGISTERED_PROGRAM_PDA = new PublicKey(
  '35hkDgaAKwMCaxRz2ocSZ6NaUrtKkyNqU6c4RV3tYJRh'
);

const ACCOUNT_COMPRESSION_AUTHORITY_PDA = new PublicKey(
  'HwXnGK3tPkkVY6P439H2p68AxpeuWXd5PcrAxFpbmfbA'
);

const ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  'compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq'
);

/** Max serialized v0 message size (bytes) before signing. */
export const STEALTH_V0_MESSAGE_MAX_BYTES = 1280;

/** Solana UDP packet limit for a fully serialized transaction. */
export const PACKET_DATA_SIZE = 1232;

export function deriveStealthLightCpiSignerPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('cpi_authority')],
    programId
  );
  return pda;
}

/**
 * Writable / CPI-sensitive accounts must stay as static 32-byte keys in the v0 message.
 * Putting them only in a lookup table breaks Token-2022 transfer-hook CPI (MissingAccount).
 */
export function stealthSendLookupTableStaticAccounts(
  cluster: SupportedCluster = 'devnet'
): PublicKey[] {
  const stealthProgramId = getPierronStealthProgramId(cluster);
  const pierronProgramId = getPierronProgramId(cluster);
  const mint = getConfiguredTokenMint(cluster);
  if (!mint) {
    throw new Error(`Brak skonfigurowanego mint dla klastra ${cluster}.`);
  }

  const { stealthAuthority, stealthVault } = deriveStealthAuthorityAndVault({
    programId: stealthProgramId,
    mint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });

  const hookProgramId = getPierronTransferHookProgramId(cluster);
  const redistributionVault = getConfiguredRedistributionVault(cluster);
  if (!redistributionVault) {
    throw new Error(`Brak redistributionVault dla klastra ${cluster}.`);
  }

  const [tradeConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('trade-config')],
    pierronProgramId
  );
  const [accountingState] = PublicKey.findProgramAddressSync(
    [Buffer.from('accounting')],
    pierronProgramId
  );
  const [venueAllowlist] = PublicKey.findProgramAddressSync(
    [Buffer.from('venue-allowlist'), mint.toBuffer()],
    pierronProgramId
  );
  const [tradeBook] = PublicKey.findProgramAddressSync(
    [Buffer.from('trade-book'), mint.toBuffer()],
    pierronProgramId
  );
  const [extraAccountMetaState] = PublicKey.findProgramAddressSync(
    [Buffer.from('extra-account-metas'), mint.toBuffer()],
    hookProgramId
  );
  const [hookTaxDelegate] = PublicKey.findProgramAddressSync(
    [Buffer.from('hook-tax-delegate'), mint.toBuffer()],
    pierronProgramId
  );

  return [
    stealthVault,
    tradeConfig,
    accountingState,
    venueAllowlist,
    tradeBook,
    redistributionVault,
    extraAccountMetaState,
    hookTaxDelegate,
    stealthAuthority,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    hookProgramId,
  ];
}

/**
 * Read-only / program IDs for LUT (shrinks tx). Writable hook + vault PDAs stay static.
 * Create via `scripts/devnet-create-stealth-alt.ts`.
 */
export function buildStealthSendLookupTableAddresses(
  cluster: SupportedCluster = 'devnet'
): PublicKey[] {
  const stealthProgramId = getPierronStealthProgramId(cluster);
  const pierronProgramId = getPierronProgramId(cluster);
  const mint = getConfiguredTokenMint(cluster);
  if (!mint) {
    throw new Error(`Brak skonfigurowanego mint dla klastra ${cluster}.`);
  }

  const cpiAuthority = deriveStealthLightCpiSignerPda(stealthProgramId);
  const staticExcluded = new Set(
    stealthSendLookupTableStaticAccounts(cluster).map((p) => p.toBase58())
  );

  const addresses = [
    TOKEN_2022_PROGRAM_ID,
    SYSTEM_PROGRAM_ID,
    ComputeBudgetProgram.programId,
    pierronProgramId,
    stealthProgramId,
    mint,
    LIGHT_SYSTEM_PROGRAM_ID,
    cpiAuthority,
    REGISTERED_PROGRAM_PDA,
    ACCOUNT_COMPRESSION_AUTHORITY_PDA,
    ACCOUNT_COMPRESSION_PROGRAM_ID,
    LOCALNET_LIGHT_ACCOUNTS.addressTree,
    LOCALNET_LIGHT_ACCOUNTS.addressQueue,
    LOCALNET_LIGHT_ACCOUNTS.stateQueue,
    LOCALNET_LIGHT_ACCOUNTS.stateTree,
  ].filter((pk) => !staticExcluded.has(pk.toBase58()));

  const seen = new Set<string>();
  return addresses.filter((pk) => {
    const key = pk.toBase58();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getStealthSendLookupTableAddress(
  cluster: SupportedCluster = 'devnet'
): PublicKey | null {
  return getConfiguredStealthSendLookupTable(cluster);
}

export async function fetchStealthSendLookupTable(
  connection: Connection,
  cluster: SupportedCluster = 'devnet'
): Promise<AddressLookupTableAccount | null> {
  const address = getStealthSendLookupTableAddress(cluster);
  if (!address) return null;

  const response = await connection.getAddressLookupTable(address);
  return response.value ?? null;
}
