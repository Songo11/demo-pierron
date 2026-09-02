import * as Linking from 'expo-linking';
import type { AppCluster } from './config';

export function getExplorerAddressUrl(address: string, cluster: AppCluster): string {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

export function getExplorerTxUrl(signature: string, cluster: AppCluster): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export async function openExplorerTx(
  signature: string,
  cluster: AppCluster
): Promise<void> {
  await Linking.openURL(getExplorerTxUrl(signature, cluster));
}

export async function openExplorerAddress(
  address: string,
  cluster: AppCluster
): Promise<void> {
  const url = getExplorerAddressUrl(address, cluster);
  await Linking.openURL(url);
}
