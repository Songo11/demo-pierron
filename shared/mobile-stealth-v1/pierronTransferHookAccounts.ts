import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js';
import type { SupportedCluster } from '../core/programIds.ts';
import {
  getConfiguredRedistributionVault,
  getPierronProgramId,
  getPierronTransferHookProgramId,
} from '../core/programIds.ts';

export type PierronTransferHookAccounts = {
  pierronProgram: PublicKey;
  transferHookProgram: PublicKey;
  tradeConfig: PublicKey;
  accountingState: PublicKey;
  venueAllowlist: PublicKey;
  tradeBook: PublicKey;
  /** From TradeConfig — filled by caller after loading trade config, or derived offline. */
  redistributionVault: PublicKey;
  instructions: PublicKey;
  /** TLV PDA under the transfer-hook program (Token-2022 `execute`). */
  extraAccountMetaState: PublicKey;
  hookTaxDelegate: PublicKey;
};

export function resolvePierronTransferHookAccounts(params: {
  mint: PublicKey;
  redistributionVault?: PublicKey;
  /**
   * @deprecated Unused after ExtraAccountMetaList stopped requiring user ATA.
   * Kept so older call sites still typecheck.
   */
  userTokenAccount?: PublicKey;
  cluster?: SupportedCluster;
}): PierronTransferHookAccounts {
  const pierronProgram = getPierronProgramId(params.cluster);
  const transferHookProgram = getPierronTransferHookProgramId(params.cluster);
  const redistributionVault =
    params.redistributionVault ?? getConfiguredRedistributionVault(params.cluster);
  if (!redistributionVault) {
    throw new Error(
      `Brak redistributionVault dla klastra ${params.cluster ?? 'devnet'} — ustaw PROGRAM_IDS redistributionVault.`
    );
  }

  const [tradeConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('trade-config')],
    pierronProgram
  );
  const [accountingState] = PublicKey.findProgramAddressSync(
    [Buffer.from('accounting')],
    pierronProgram
  );
  const [venueAllowlist] = PublicKey.findProgramAddressSync(
    [Buffer.from('venue-allowlist'), params.mint.toBuffer()],
    pierronProgram
  );
  const [tradeBook] = PublicKey.findProgramAddressSync(
    [Buffer.from('trade-book'), params.mint.toBuffer()],
    pierronProgram
  );
  const [extraAccountMetaState] = PublicKey.findProgramAddressSync(
    [Buffer.from('extra-account-metas'), params.mint.toBuffer()],
    transferHookProgram
  );
  const [hookTaxDelegate] = PublicKey.findProgramAddressSync(
    [Buffer.from('hook-tax-delegate'), params.mint.toBuffer()],
    pierronProgram
  );

  return {
    pierronProgram,
    transferHookProgram,
    tradeConfig,
    accountingState,
    venueAllowlist,
    tradeBook,
    redistributionVault,
    instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    extraAccountMetaState,
    hookTaxDelegate,
  };
}

/**
 * Named-account order for `SendStealth` / `ClaimStealth` after token (+ system on send).
 * Must match on-chain `SendStealth` / `ClaimStealth` account structs.
 */
export function pierronTransferHookAccountMetas(
  accounts: PierronTransferHookAccounts
): Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> {
  const metas = [
    { pubkey: accounts.pierronProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.transferHookProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.tradeConfig, isSigner: false, isWritable: true },
    { pubkey: accounts.accountingState, isSigner: false, isWritable: true },
    { pubkey: accounts.venueAllowlist, isSigner: false, isWritable: true },
    { pubkey: accounts.tradeBook, isSigner: false, isWritable: true },
    { pubkey: accounts.redistributionVault, isSigner: false, isWritable: true },
    { pubkey: accounts.instructions, isSigner: false, isWritable: false },
    { pubkey: accounts.extraAccountMetaState, isSigner: false, isWritable: false },
    { pubkey: accounts.hookTaxDelegate, isSigner: false, isWritable: false },
  ];
  for (const meta of metas) {
    if (!meta.pubkey) {
      throw new Error(
        'pierronTransferHookAccountMetas: brak pubkey (redistributionVault / hook program?)'
      );
    }
  }
  return metas;
}
