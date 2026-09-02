import DLMM, {
  ClockLayout,
  chunkedGetMultipleAccountInfos,
  createProgram,
  decodeAccount,
  deriveBinArray,
  deriveBinArrayBitmapExtension,
  findNextBinArrayIndexWithLiquidity,
  getBinArrayLowerUpperBinId,
} from "@meteora-ag/dlmm";
import { BN } from "@coral-xyz/anchor";
import { AccountLayout, TOKEN_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import { PublicKey, SYSVAR_CLOCK_PUBKEY, type Connection } from "@solana/web3.js";
import { accountDataToBuffer } from "./accountDataBuffer.ts";

type DlmmOpt = Parameters<typeof DLMM.create>[2];

/**
 * SDK `getBinArrayForSwap` zawsze woła `refetchStates()` (~11 kont RPC).
 * Na mobile to zabija prep swapu (timeout zanim portfel). Tu tylko bitmap + bin arrays.
 */
export async function getBinArrayForSwapWithoutRefetch(
  dlmm: InstanceType<typeof DLMM>,
  swapForY: boolean,
  count = 4
): Promise<
  Awaited<ReturnType<InstanceType<typeof DLMM>["getBinArrayForSwap"]>>
> {
  const binArraysPubkey = new Set<string>();
  let shouldStop = false;
  let activeIdToLoop = dlmm.lbPair.activeId;
  const bitmapExt =
    (dlmm.binArrayBitmapExtension as { account?: unknown } | null | undefined)
      ?.account ?? null;

  while (!shouldStop) {
    const binArrayIndex = findNextBinArrayIndexWithLiquidity(
      swapForY,
      new BN(activeIdToLoop),
      dlmm.lbPair,
      bitmapExt as any
    );
    if (binArrayIndex === null) {
      shouldStop = true;
    } else {
      const [binArrayPubKey] = deriveBinArray(
        dlmm.pubkey,
        binArrayIndex,
        dlmm.program.programId
      );
      binArraysPubkey.add(binArrayPubKey.toBase58());
      const [lowerBinId, upperBinId] = getBinArrayLowerUpperBinId(binArrayIndex);
      activeIdToLoop = swapForY
        ? lowerBinId.toNumber() - 1
        : upperBinId.toNumber() + 1;
    }
    if (binArraysPubkey.size === count) shouldStop = true;
  }

  const accountsToFetch = Array.from(binArraysPubkey).map(
    (pubkey) => new PublicKey(pubkey)
  );
  if (accountsToFetch.length === 0) {
    return [];
  }

  const binArraysAccInfoBuffer = await chunkedGetMultipleAccountInfos(
    dlmm.program.provider.connection,
    accountsToFetch
  );

  return Promise.all(
    binArraysAccInfoBuffer.map(async (accInfo, idx) => {
      if (!accInfo?.data) {
        throw new Error(
          `Bin array ${accountsToFetch[idx]!.toBase58()} not found`
        );
      }
      const account = decodeAccount(
        dlmm.program,
        "binArray",
        accountDataToBuffer(accInfo.data)
      );
      return {
        account,
        publicKey: accountsToFetch[idx]!,
      };
    })
  ) as Awaited<ReturnType<InstanceType<typeof DLMM>["getBinArrayForSwap"]>>;
}

/** Idempotent — także dla DLMM już trzymanego w sesji mobile (hot reload). */
export function patchDlmmFastBinArrayForSwap(
  dlmm: InstanceType<typeof DLMM>
): void {
  const marked = dlmm as InstanceType<typeof DLMM> & {
    __pierronFastBinArrays?: boolean;
  };
  if (marked.__pierronFastBinArrays) return;
  marked.getBinArrayForSwap = async function getBinArrayForSwapFast(
    swapForY: boolean,
    count = 4
  ) {
    return getBinArrayForSwapWithoutRefetch(this, swapForY, count);
  };
  marked.__pierronFastBinArrays = true;
}

/**
 * Loads a Meteora DLMM pool without calling `addExtraAccountMetasForExecute`.
 * Pierron hook metas are resolved per transfer in {@link buildPierronDlmmSwapTx}.
 */
export async function createPierronDlmmPool(
  connection: Connection,
  pool: PublicKey,
  opt?: DlmmOpt
): Promise<InstanceType<typeof DLMM>> {
  const program = createProgram(connection, opt);
  const binArrayBitMapExtensionPubkey = deriveBinArrayBitmapExtension(
    pool,
    program.programId
  )[0];

  let accountsInfo = await chunkedGetMultipleAccountInfos(connection, [
    pool,
    binArrayBitMapExtensionPubkey,
    SYSVAR_CLOCK_PUBKEY,
  ]);

  const lbPairAccountInfoBuffer = accountsInfo[0]?.data;
  if (!lbPairAccountInfoBuffer) {
    throw new Error(`LB Pair account ${pool.toBase58()} not found`);
  }
  const lbPairAccInfo = decodeAccount(
    program,
    "lbPair",
    accountDataToBuffer(lbPairAccountInfoBuffer)
  ) as InstanceType<typeof DLMM>["lbPair"];

  const binArrayBitMapAccountInfoBuffer = accountsInfo[1]?.data;
  let binArrayBitmapExtensionAccInfo = null;
  let binArrayBitmapExtension = undefined;
  if (binArrayBitMapAccountInfoBuffer) {
    binArrayBitmapExtensionAccInfo = decodeAccount(
      program,
      "binArrayBitmapExtension",
      accountDataToBuffer(binArrayBitMapAccountInfoBuffer)
    );
    binArrayBitmapExtension = {
      account: binArrayBitmapExtensionAccInfo,
      publicKey: binArrayBitMapExtensionPubkey,
    };
  }

  const clockAccountInfoBuffer = accountsInfo[2]?.data;
  if (!clockAccountInfoBuffer) {
    throw new Error("Clock account not found");
  }
  const clock = ClockLayout.decode(accountDataToBuffer(clockAccountInfoBuffer));

  accountsInfo = await chunkedGetMultipleAccountInfos(connection, [
    lbPairAccInfo.reserveX,
    lbPairAccInfo.reserveY,
    lbPairAccInfo.tokenXMint,
    lbPairAccInfo.tokenYMint,
    lbPairAccInfo.rewardInfos[0].vault,
    lbPairAccInfo.rewardInfos[1].vault,
    lbPairAccInfo.rewardInfos[0].mint,
    lbPairAccInfo.rewardInfos[1].mint,
  ]);

  const [
    reserveXAccount,
    reserveYAccount,
    tokenXMintAccount,
    tokenYMintAccount,
    reward0VaultAccount,
    reward1VaultAccount,
    reward0MintAccount,
    reward1MintAccount,
  ] = accountsInfo;

  if (
    !reserveXAccount ||
    !reserveYAccount ||
    !tokenXMintAccount ||
    !tokenYMintAccount
  ) {
    throw new Error("Pool reserve or mint accounts missing");
  }

  const reserveXBalance = AccountLayout.decode(
    accountDataToBuffer(reserveXAccount.data)
  );
  const reserveYBalance = AccountLayout.decode(
    accountDataToBuffer(reserveYAccount.data)
  );
  const mintX = unpackMint(
    lbPairAccInfo.tokenXMint,
    tokenXMintAccount,
    tokenXMintAccount.owner
  );
  const mintY = unpackMint(
    lbPairAccInfo.tokenYMint,
    tokenYMintAccount,
    tokenYMintAccount.owner
  );

  const tokenX = {
    publicKey: lbPairAccInfo.tokenXMint,
    reserve: lbPairAccInfo.reserveX,
    amount: reserveXBalance.amount,
    mint: mintX,
    owner: tokenXMintAccount.owner,
    transferHookAccountMetas: [] as {
      pubkey: PublicKey;
      isSigner: boolean;
      isWritable: boolean;
    }[],
  };
  const tokenY = {
    publicKey: lbPairAccInfo.tokenYMint,
    reserve: lbPairAccInfo.reserveY,
    amount: reserveYBalance.amount,
    mint: mintY,
    owner: tokenYMintAccount.owner,
    transferHookAccountMetas: [] as {
      pubkey: PublicKey;
      isSigner: boolean;
      isWritable: boolean;
    }[],
  };

  const reward0 =
    !lbPairAccInfo.rewardInfos[0].mint.equals(PublicKey.default) &&
    reward0VaultAccount &&
    reward0MintAccount
      ? {
          publicKey: lbPairAccInfo.rewardInfos[0].mint,
          reserve: lbPairAccInfo.rewardInfos[0].vault,
          amount: AccountLayout.decode(accountDataToBuffer(reward0VaultAccount.data))
            .amount,
          mint: unpackMint(
            lbPairAccInfo.rewardInfos[0].mint,
            reward0MintAccount,
            reward0MintAccount.owner
          ),
          owner: reward0MintAccount.owner,
          transferHookAccountMetas: [],
        }
      : null;

  const reward1 =
    !lbPairAccInfo.rewardInfos[1].mint.equals(PublicKey.default) &&
    reward1VaultAccount &&
    reward1MintAccount
      ? {
          publicKey: lbPairAccInfo.rewardInfos[1].mint,
          reserve: lbPairAccInfo.rewardInfos[1].vault,
          amount: AccountLayout.decode(accountDataToBuffer(reward1VaultAccount.data))
            .amount,
          mint: unpackMint(
            lbPairAccInfo.rewardInfos[1].mint,
            reward1MintAccount,
            reward1MintAccount.owner
          ),
          owner: reward1MintAccount.owner,
          transferHookAccountMetas: [],
        }
      : null;

  const dlmmPool = new DLMM(
    pool,
    program,
    lbPairAccInfo,
    (binArrayBitmapExtension ?? null) as ConstructorParameters<typeof DLMM>[3],
    tokenX,
    tokenY,
    [reward0, reward1],
    clock,
    opt
  );

  // Meteora refetchStates re-resolves transfer hooks via spl-token (fails on Pierron TLV).
  dlmmPool.refetchStates = async function refetchStatesWithoutHookPreload() {
    const binArrayBitmapExtensionPubkey = deriveBinArrayBitmapExtension(
      this.pubkey,
      this.program.programId
    )[0];
    const [
      lbPairAccountInfo,
      binArrayBitmapExtensionAccountInfo,
      reserveXAccountInfo,
      reserveYAccountInfo,
      mintXAccountInfo,
      mintYAccountInfo,
      reward0VaultAccountInfo,
      reward1VaultAccountInfo,
      rewardMint0AccountInfo,
      rewardMint1AccountInfo,
      clockAccountInfo,
    ] = await chunkedGetMultipleAccountInfos(this.program.provider.connection, [
      this.pubkey,
      binArrayBitmapExtensionPubkey,
      this.lbPair.reserveX,
      this.lbPair.reserveY,
      this.lbPair.tokenXMint,
      this.lbPair.tokenYMint,
      this.lbPair.rewardInfos[0].vault,
      this.lbPair.rewardInfos[1].vault,
      this.lbPair.rewardInfos[0].mint,
      this.lbPair.rewardInfos[1].mint,
      SYSVAR_CLOCK_PUBKEY,
    ]);

    const lbPairState = decodeAccount(
      this.program,
      "lbPair",
      accountDataToBuffer(lbPairAccountInfo!.data)
    ) as InstanceType<typeof DLMM>["lbPair"];
    if (binArrayBitmapExtensionAccountInfo) {
      const binArrayBitmapExtensionState = decodeAccount(
        this.program,
        "binArrayBitmapExtension",
        accountDataToBuffer(binArrayBitmapExtensionAccountInfo.data)
      );
      if (binArrayBitmapExtensionState) {
        this.binArrayBitmapExtension = {
          account: binArrayBitmapExtensionState,
          publicKey: binArrayBitmapExtensionPubkey,
        } as NonNullable<ConstructorParameters<typeof DLMM>[3]>;
      }
    }

    const reserveXBalance = AccountLayout.decode(
      accountDataToBuffer(reserveXAccountInfo!.data)
    );
    const reserveYBalance = AccountLayout.decode(
      accountDataToBuffer(reserveYAccountInfo!.data)
    );
    const mintX = unpackMint(
      this.tokenX.publicKey,
      mintXAccountInfo!,
      mintXAccountInfo!.owner
    );
    const mintY = unpackMint(
      this.tokenY.publicKey,
      mintYAccountInfo!,
      mintYAccountInfo!.owner
    );

    this.tokenX = {
      amount: reserveXBalance.amount,
      mint: mintX,
      publicKey: lbPairState.tokenXMint,
      reserve: lbPairState.reserveX,
      owner: mintXAccountInfo!.owner,
      transferHookAccountMetas: [],
    };
    this.tokenY = {
      amount: reserveYBalance.amount,
      mint: mintY,
      publicKey: lbPairState.tokenYMint,
      reserve: lbPairState.reserveY,
      owner: mintYAccountInfo!.owner,
      transferHookAccountMetas: [],
    };

    this.rewards[0] = null;
    this.rewards[1] = null;
    if (
      !lbPairState.rewardInfos[0].mint.equals(PublicKey.default) &&
      reward0VaultAccountInfo &&
      rewardMint0AccountInfo
    ) {
      this.rewards[0] = {
        publicKey: lbPairState.rewardInfos[0].mint,
        reserve: lbPairState.rewardInfos[0].vault,
        mint: unpackMint(
          lbPairState.rewardInfos[0].mint,
          rewardMint0AccountInfo,
          rewardMint0AccountInfo.owner
        ),
        amount: AccountLayout.decode(
          accountDataToBuffer(reward0VaultAccountInfo.data)
        ).amount,
        owner: rewardMint0AccountInfo.owner,
        transferHookAccountMetas: [],
      };
    }
    if (
      !lbPairState.rewardInfos[1].mint.equals(PublicKey.default) &&
      reward1VaultAccountInfo &&
      rewardMint1AccountInfo
    ) {
      this.rewards[1] = {
        publicKey: lbPairState.rewardInfos[1].mint,
        reserve: lbPairState.rewardInfos[1].vault,
        mint: unpackMint(
          lbPairState.rewardInfos[1].mint,
          rewardMint1AccountInfo,
          rewardMint1AccountInfo.owner
        ),
        amount: AccountLayout.decode(
          accountDataToBuffer(reward1VaultAccountInfo.data)
        ).amount,
        owner: rewardMint1AccountInfo.owner,
        transferHookAccountMetas: [],
      };
    }

    this.clock = ClockLayout.decode(accountDataToBuffer(clockAccountInfo!.data));
    this.lbPair = lbPairState;
  };

  // Krytyczne na mobile: bez tego każde warm/quote = pełny refetchStates (~11 RPC).
  patchDlmmFastBinArrayForSwap(dlmmPool);

  return dlmmPool;
}
