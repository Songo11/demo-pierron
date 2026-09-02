import path from 'path';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(__dirname, '..');

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  // Monorepo has root + dapp lockfiles; pin tracing root to silence Next warning.
  outputFileTracingRoot: repoRoot,
  turbopack: {
    // Must match outputFileTracingRoot (Next 16).
    root: repoRoot,
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.mts', '.json'],
  },
  typescript: {
    tsconfigPath: './tsconfig.build.json',
    ignoreBuildErrors: true,
  },
  // Safe Send pulls shared Light + stealth modules from monorepo root.
  transpilePackages: ['@lightprotocol/stateless.js'],
  // Keep Solana crypto stacks out of Turbopack graph for App Routes when possible.
  serverExternalPackages: [
    '@solana/web3.js',
    '@noble/curves',
    '@noble/hashes',
  ],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      fs: false,
      net: false,
      tls: false,
      path: false,
      crypto: false,
    };
    // Prefer dapp/node_modules so shared/* imports resolve on Vercel
    // (repo root often has no node_modules when Root is the monorepo).
    config.resolve.modules = [
      path.join(__dirname, 'node_modules'),
      path.join(repoRoot, 'node_modules'),
      ...(config.resolve.modules ?? ['node_modules']),
    ];
    // Lower peak RAM during ecosystem/swap compiles (avoids silent Node exit).
    config.parallelism = 1;
    return config;
  },
  async redirects() {
    return [
      { source: '/pool', destination: '/swap', permanent: false },
      { source: '/p', destination: '/swap', permanent: false },
      { source: '/meteora', destination: '/swap', permanent: false },
      {
        source: '/bookmark',
        destination: '/pierron-pool.html',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
