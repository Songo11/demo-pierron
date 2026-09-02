'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useEffect, useState } from 'react';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

import idl from './pierron.json';
import { pierronDevnet } from './lib/pierronDevnet';

const PROGRAM_ID = pierronDevnet.pierronProgramId;

export default function Dashboard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [status, setStatus] = useState("Połącz wallet");
  const [program, setProgram] = useState<any>(null);

  useEffect(() => {
    if (!wallet.publicKey || !connection) return;

    try {
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: 'confirmed',
      });
      const prog = new Program(idl as any, provider);
      setProgram(prog);
      setStatus("Program załadowany");
    } catch (err) {
      console.error("Błąd IDL:", err);
      setStatus("Błąd ładowania IDL – sprawdź ścieżkę do pliku");
    }
  }, [wallet.publicKey, connection]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-4xl font-bold text-center mb-10 text-purple-400">Pierron Dashboard</h1>

        <div className="flex justify-center mb-8">
          <WalletMultiButton className="bg-purple-600 hover:bg-purple-700 px-8 py-3 rounded-xl text-lg" />
        </div>

        <div className="bg-gray-800 p-8 rounded-2xl">
          <p className="mb-6 text-sm opacity-80">Program ID: {PROGRAM_ID.toBase58().slice(0, 12)}...</p>
          <p className="mb-8 font-medium text-lg">Status: {status}</p>

          <div className="space-y-4">
            <button onClick={() => setStatus("Buy – w trakcie...")} className="w-full bg-green-600 py-4 rounded-xl hover:bg-green-700 text-lg font-semibold">
              Buy 100k Tokens
            </button>

            <button onClick={() => setStatus("Sell – w trakcie...")} className="w-full bg-red-600 py-4 rounded-xl hover:bg-red-700 text-lg font-semibold">
              Sell Tokens
            </button>

            <button onClick={() => setStatus("Claim – w trakcie...")} className="w-full bg-blue-600 py-4 rounded-xl hover:bg-blue-700 text-lg font-semibold">
              Claim Redistribution
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
