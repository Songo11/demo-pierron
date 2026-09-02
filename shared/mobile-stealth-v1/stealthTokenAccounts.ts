import {
  Connection,
  PublicKey,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

export const STEALTH_AUTHORITY_SEED = Buffer.from('stealth-authority');

export type StealthTokenAccountsResolved = {
  mint: PublicKey;
  senderToken: PublicKey;
  claimerToken: PublicKey;
  stealthAuthority: PublicKey;
  stealthToken: PublicKey;
};

export type TokenAccountExistence = {
  address: PublicKey;
  exists: boolean;
};

export function deriveStealthAuthorityForMint(params: {
  programId: PublicKey;
  mint: PublicKey;
}): { stealthAuthority: PublicKey; bump: number } {
  const [stealthAuthority, bump] = PublicKey.findProgramAddressSync(
    [STEALTH_AUTHORITY_SEED, params.mint.toBuffer()],
    params.programId
  );

  return { stealthAuthority, bump };
}

export function deriveUserAta(params: {
  owner: PublicKey;
  mint: PublicKey;
  tokenProgramId?: PublicKey;
  associatedTokenProgramId?: PublicKey;
}): PublicKey {
  return getAssociatedTokenAddressSync(
    params.mint,
    params.owner,
    false,
    params.tokenProgramId ?? TOKEN_PROGRAM_ID,
    params.associatedTokenProgramId ?? ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

export function deriveStealthVaultAta(params: {
  mint: PublicKey;
  stealthAuthority: PublicKey;
  tokenProgramId?: PublicKey;
  associatedTokenProgramId?: PublicKey;
}): PublicKey {
  return getAssociatedTokenAddressSync(
    params.mint,
    params.stealthAuthority,
    true,
    params.tokenProgramId ?? TOKEN_PROGRAM_ID,
    params.associatedTokenProgramId ?? ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

export function resolveStealthTokenAccounts(params: {
  programId: PublicKey;
  mint: PublicKey;
  sender: PublicKey;
  claimer?: PublicKey;
  tokenProgramId?: PublicKey;
  associatedTokenProgramId?: PublicKey;
}): StealthTokenAccountsResolved {
  const tokenProgramId = params.tokenProgramId ?? TOKEN_PROGRAM_ID;
  const associatedTokenProgramId =
    params.associatedTokenProgramId ?? ASSOCIATED_TOKEN_PROGRAM_ID;

  const { stealthAuthority } = deriveStealthAuthorityForMint({
    programId: params.programId,
    mint: params.mint,
  });

  const senderToken = deriveUserAta({
    owner: params.sender,
    mint: params.mint,
    tokenProgramId,
    associatedTokenProgramId,
  });

  const claimerOwner = params.claimer ?? params.sender;
  const claimerToken = deriveUserAta({
    owner: claimerOwner,
    mint: params.mint,
    tokenProgramId,
    associatedTokenProgramId,
  });

  const stealthToken = deriveStealthVaultAta({
    mint: params.mint,
    stealthAuthority,
    tokenProgramId,
    associatedTokenProgramId,
  });

  return {
    mint: params.mint,
    senderToken,
    claimerToken,
    stealthAuthority,
    stealthToken,
  };
}

export async function checkTokenAccountExists(
  connection: Connection,
  address: PublicKey
): Promise<TokenAccountExistence> {
  const info = await connection.getAccountInfo(address, 'confirmed');
  return {
    address,
    exists: Boolean(info),
  };
}

export async function checkResolvedStealthTokenAccounts(
  connection: Connection,
  accounts: StealthTokenAccountsResolved
): Promise<{
  senderToken: TokenAccountExistence;
  claimerToken: TokenAccountExistence;
  stealthToken: TokenAccountExistence;
}> {
  const [senderToken, claimerToken, stealthToken] = await Promise.all([
    checkTokenAccountExists(connection, accounts.senderToken),
    checkTokenAccountExists(connection, accounts.claimerToken),
    checkTokenAccountExists(connection, accounts.stealthToken),
  ]);

  return {
    senderToken,
    claimerToken,
    stealthToken,
  };
}

export async function resolveAndCheckStealthTokenAccounts(params: {
  connection: Connection;
  programId: PublicKey;
  mint: PublicKey;
  sender: PublicKey;
  claimer?: PublicKey;
  tokenProgramId?: PublicKey;
  associatedTokenProgramId?: PublicKey;
}): Promise<{
  resolved: StealthTokenAccountsResolved;
  existence: {
    senderToken: TokenAccountExistence;
    claimerToken: TokenAccountExistence;
    stealthToken: TokenAccountExistence;
  };
}> {
  const resolved = resolveStealthTokenAccounts({
    programId: params.programId,
    mint: params.mint,
    sender: params.sender,
    claimer: params.claimer,
    tokenProgramId: params.tokenProgramId,
    associatedTokenProgramId: params.associatedTokenProgramId,
  });

  const existence = await checkResolvedStealthTokenAccounts(
    params.connection,
    resolved
  );

  return {
    resolved,
    existence,
  };
}

export function summarizeResolvedStealthTokenAccounts(input: {
  resolved: StealthTokenAccountsResolved;
  existence?: {
    senderToken?: TokenAccountExistence;
    claimerToken?: TokenAccountExistence;
    stealthToken?: TokenAccountExistence;
  };
}): string[] {
  const lines = [
    `Mint: ${input.resolved.mint.toBase58()}`,
    `Sender token: ${input.resolved.senderToken.toBase58()}`,
    `Claimer token: ${input.resolved.claimerToken.toBase58()}`,
    `Stealth authority: ${input.resolved.stealthAuthority.toBase58()}`,
    `Stealth token vault: ${input.resolved.stealthToken.toBase58()}`,
  ];

  if (input.existence) {
    lines.push(
      `Sender token istnieje: ${input.existence.senderToken?.exists ? 'tak' : 'nie'}`
    );
    lines.push(
      `Claimer token istnieje: ${input.existence.claimerToken?.exists ? 'tak' : 'nie'}`
    );
    lines.push(
      `Stealth token vault istnieje: ${input.existence.stealthToken?.exists ? 'tak' : 'nie'}`
    );
  }

  return lines;
}
