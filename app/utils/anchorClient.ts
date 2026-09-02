// app/utils/anchorClient.ts
import { PublicKey, Transaction, TransactionInstruction, Connection } from '@solana/web3.js';
import idl from '../pierron.json';

const PROGRAM_ID = new PublicKey(
  (idl as { address?: string }).address ||
    'A9kNasYvn9ZqdEzHvRHqQFtouqdRzzE2udR8aUqbKb13'
);

// Helper do discriminatora z IDL
const getDiscriminator = (methodName: string) => {
  const method = idl.instructions.find(i => i.name === methodName);
  if (!method) throw new Error(`Method ${methodName} not found in IDL`);
  return Buffer.from(method.discriminator);
};

// Przykładowy builder dla buy – dostosuj args i accounts
export const createBuyInstruction = (accounts: any[], args: any) => {
  const discriminator = getDiscriminator('buy');
  // Serialize args manualnie (lub użyj borsh – npm i borsh)
  const data = Buffer.concat([discriminator /* + borsh.serialize(args) */]);
  return new TransactionInstruction({
    keys: accounts,
    programId: PROGRAM_ID,
    data,
  });
};

// Przykładowy send tx
export const sendTx = async (
  connection: Connection,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  instructions: TransactionInstruction[]
) => {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const tx = new Transaction().add(...instructions);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;
  const signedTx = await wallet.signTransaction(tx);
  const txId = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction(txId);
  return txId;
};
