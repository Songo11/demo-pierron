/**
 * Open the current dapp URL inside Phantom / Solflare in-app browsers.
 *
 * On GrapheneOS/Vanadium, Mobile Wallet Adapter often cannot complete the
 * round-trip (authorize in wallet → return to browser still disconnected).
 * Browse deeplinks keep the user inside the wallet browser where the provider
 * is injected and connect works.
 */

export const PENDING_WALLET_BROWSE_KEY = 'pierron-pending-wallet-browse';
export const RESUME_WALLET_NAME_KEY = 'pierron-resume-wallet-name';
/** Set when the user explicitly disconnects — blocks autoConnect / resume for this tab. */
export const WALLET_USER_DISCONNECTED_KEY = 'pierron-wallet-user-disconnected';

export function markWalletUserDisconnected(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(WALLET_USER_DISCONNECTED_KEY, '1');
    sessionStorage.removeItem(RESUME_WALLET_NAME_KEY);
    sessionStorage.removeItem(PENDING_WALLET_BROWSE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearWalletUserDisconnected(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(WALLET_USER_DISCONNECTED_KEY);
  } catch {
    /* ignore */
  }
}

export function isWalletUserDisconnected(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(WALLET_USER_DISCONNECTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWalletResumePending(walletName: string): void {
  if (typeof window === 'undefined') return;
  try {
    clearWalletUserDisconnected();
    sessionStorage.setItem(RESUME_WALLET_NAME_KEY, walletName);
  } catch {
    /* ignore */
  }
}

export function isAndroidUserAgent(
  ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): boolean {
  return /android/i.test(ua);
}

export type InjectedWalletKind = 'phantom' | 'solflare' | null;

/** Detect Phantom/Solflare in-app browser (provider injected). */
export function detectInjectedWalletBrowser(): InjectedWalletKind {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    phantom?: { solana?: { isPhantom?: boolean; connect?: () => Promise<unknown> } };
    solflare?: { isSolflare?: boolean; connect?: () => Promise<unknown> };
    SolflareApp?: unknown;
    solana?: { isPhantom?: boolean; isSolflare?: boolean; connect?: () => Promise<unknown> };
  };
  if (w.solflare?.isSolflare || w.SolflareApp || w.solana?.isSolflare) return 'solflare';
  if (w.phantom?.solana?.isPhantom || w.solana?.isPhantom) return 'phantom';
  const ua = navigator.userAgent || '';
  if (/Solflare/i.test(ua)) return 'solflare';
  if (/Phantom/i.test(ua)) return 'phantom';
  return null;
}

/** Directly connect injected provider (bypasses adapter race). */
export async function connectInjectedProviderDirect(
  kind: Exclude<InjectedWalletKind, null>
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const w = window as Window & {
    phantom?: { solana?: { connect?: (opts?: { onlyIfTrusted?: boolean }) => Promise<unknown> } };
    solflare?: { connect?: (opts?: { onlyIfTrusted?: boolean }) => Promise<unknown> };
    solana?: { connect?: (opts?: { onlyIfTrusted?: boolean }) => Promise<unknown> };
  };
  try {
    if (kind === 'solflare') {
      const p = w.solflare ?? (w.solana?.connect ? w.solana : null);
      if (!p?.connect) return false;
      await p.connect();
      return true;
    }
    const p = w.phantom?.solana ?? (w.solana?.connect ? w.solana : null);
    if (!p?.connect) return false;
    await p.connect();
    return true;
  } catch {
    return false;
  }
}

function encodeBrowseTarget(url: string): string {
  return encodeURIComponent(url);
}

function markPendingBrowse(kind: 'phantom' | 'solflare'): void {
  markWalletResumePending(kind === 'solflare' ? 'Solflare' : 'Phantom');
  try {
    sessionStorage.setItem(PENDING_WALLET_BROWSE_KEY, kind);
  } catch {
    /* ignore */
  }
}

/** Phantom browse — custom scheme + https + Android intent fallbacks. */
export function buildPhantomBrowseUrls(pageUrl: string, refUrl: string): string[] {
  const path = `ul/browse/${encodeBrowseTarget(pageUrl)}?ref=${encodeBrowseTarget(refUrl)}`;
  const httpsUrl = `https://phantom.app/${path}`;
  const schemeUrl = `phantom://${path}`;
  if (!isAndroidUserAgent()) return [httpsUrl];
  const fallback = encodeURIComponent(
    'https://play.google.com/store/apps/details?id=app.phantom'
  );
  const intentUrl = `intent://${path}#Intent;scheme=https;host=phantom.app;package=app.phantom;S.browser_fallback_url=${fallback};end`;
  return [schemeUrl, httpsUrl, intentUrl];
}

/** Solflare browse — custom scheme (sample app) + https + intent. */
export function buildSolflareBrowseUrls(pageUrl: string, refUrl: string): string[] {
  const path = `ul/v1/browse/${encodeBrowseTarget(pageUrl)}?ref=${encodeBrowseTarget(refUrl)}`;
  const httpsUrl = `https://solflare.com/${path}`;
  const schemeUrl = `solflare://${path}`;
  if (!isAndroidUserAgent()) return [httpsUrl];
  const fallback = encodeURIComponent(
    'https://play.google.com/store/apps/details?id=com.solflare.mobile'
  );
  const intentUrl = `intent://${path}#Intent;scheme=https;host=solflare.com;package=com.solflare.mobile;S.browser_fallback_url=${fallback};end`;
  return [schemeUrl, httpsUrl, intentUrl];
}

export function openUrl(url: string): void {
  if (typeof window === 'undefined') return;
  window.location.assign(url);
}

/**
 * Try custom-scheme first (GrapheneOS), then https App Link if still visible.
 */
function openBrowseCascade(urls: string[]): void {
  if (typeof window === 'undefined' || urls.length === 0) return;
  const [first, ...rest] = urls;
  openUrl(first!);
  if (rest.length === 0) return;
  let idx = 0;
  const tryNext = () => {
    if (document.visibilityState !== 'visible') return;
    if (idx >= rest.length) return;
    openUrl(rest[idx++]!);
    window.setTimeout(tryNext, 900);
  };
  window.setTimeout(tryNext, 900);
}

export function openCurrentPageInPhantom(): void {
  const page = window.location.href.split('#')[0]!;
  const ref = window.location.origin;
  markPendingBrowse('phantom');
  openBrowseCascade(buildPhantomBrowseUrls(page, ref));
}

export function openCurrentPageInSolflare(): void {
  const page = window.location.href.split('#')[0]!;
  const ref = window.location.origin;
  markPendingBrowse('solflare');
  openBrowseCascade(buildSolflareBrowseUrls(page, ref));
}

export function isMwaWalletNotFoundMessage(msg: string): boolean {
  return /no installed wallet|supports the mobile wallet protocol|can't find a wallet|cannot find a wallet/i.test(
    msg
  );
}
