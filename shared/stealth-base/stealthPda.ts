import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Buffer } from 'buffer';

export type StealthAuthorityPda = {
  stealthAuthority: PublicKey;
  bump: number;
};

export type StealthAuthorityAndVault = {
  stealthAuthority: PublicKey;
  stealthAuthorityBump: number;
  stealthVault: PublicKey;
};

export function deriveStealthAuthorityPda(params: {
  programId: PublicKey;
  mint: PublicKey;
}): StealthAuthorityPda {
  const [stealthAuthority, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('stealth-authority'), params.mint.toBytes()],
    params.programId
  );

  return {
    stealthAuthority,
    bump,
  };
}

export function deriveStealthVaultAddress(params: {
  mint: PublicKey;
  stealthAuthority: PublicKey;
  tokenProgram?: PublicKey;
}): PublicKey {
  return getAssociatedTokenAddressSync(
    params.mint,
    params.stealthAuthority,
    true,
    params.tokenProgram
  );
}

export function deriveStealthAuthorityAndVault(params: {
  programId: PublicKey;
  mint: PublicKey;
  tokenProgram?: PublicKey;
}): StealthAuthorityAndVault {
  const { stealthAuthority, bump } = deriveStealthAuthorityPda({
    programId: params.programId,
    mint: params.mint,
  });

  const stealthVault = deriveStealthVaultAddress({
    mint: params.mint,
    stealthAuthority,
    tokenProgram: params.tokenProgram,
  });

  return {
    stealthAuthority,
    stealthAuthorityBump: bump,
    stealthVault,
  };
}

export function deriveStealthAuthorityPdaFromBase58(params: {
  programId: string;
  mint: string;
}) {
  return deriveStealthAuthorityPda({
    programId: new PublicKey(params.programId),
    mint: new PublicKey(params.mint),
  });
}

export function deriveStealthAuthorityAndVaultFromBase58(params: {
  programId: string;
  mint: string;
  tokenProgram?: string;
}) {
  return deriveStealthAuthorityAndVault({
    programId: new PublicKey(params.programId),
    mint: new PublicKey(params.mint),
    tokenProgram: params.tokenProgram ? new PublicKey(params.tokenProgram) : undefined,
  });
}
