/**
 * Open the current dapp URL inside Phantom / Solflare in-app browsers.
 *
 * On GrapheneOS/Vanadium, Mobile Wallet Adapter often cannot complete the
 * round-trip (authorize in wallet → return to browser still disconnected).
 * Browse deeplinks keep the user inside the wallet browser where the provider
 * is injected and connect works.
 */

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
    phantom?: { solana?: { isPhantom?: boolean } };
    solflare?: { isSolflare?: boolean };
    SolflareApp?: unknown;
    solana?: { isPhantom?: boolean; isSolflare?: boolean };
  };
  if (w.solflare?.isSolflare || w.SolflareApp || w.solana?.isSolflare) return 'solflare';
  if (w.phantom?.solana?.isPhantom || w.solana?.isPhantom) return 'phantom';
  const ua = navigator.userAgent || '';
  if (/Solflare/i.test(ua)) return 'solflare';
  if (/Phantom/i.test(ua)) return 'phantom';
  return null;
}

function encodeBrowseTarget(url: string): string {
  return encodeURIComponent(url);
}

/** Phantom browse — Android intent:// so hardened browsers hand off to the app. */
export function buildPhantomBrowseUrl(pageUrl: string, refUrl: string): string {
  const path = `ul/browse/${encodeBrowseTarget(pageUrl)}?ref=${encodeBrowseTarget(refUrl)}`;
  if (isAndroidUserAgent()) {
    const fallback = encodeURIComponent(
      'https://play.google.com/store/apps/details?id=app.phantom'
    );
    return `intent://${path}#Intent;scheme=https;host=phantom.app;package=app.phantom;S.browser_fallback_url=${fallback};end`;
  }
  return `https://phantom.app/${path}`;
}

/** Solflare browse (+ Android intent). */
export function buildSolflareBrowseUrl(pageUrl: string, refUrl: string): string {
  // Solflare accepts both /ul/v1/browse/<url> and query form; path form matches Phantom UX.
  const path = `ul/v1/browse/${encodeBrowseTarget(pageUrl)}?ref=${encodeBrowseTarget(refUrl)}`;
  if (isAndroidUserAgent()) {
    const fallback = encodeURIComponent(
      'https://play.google.com/store/apps/details?id=com.solflare.mobile'
    );
    return `intent://${path}#Intent;scheme=https;host=solflare.com;package=com.solflare.mobile;S.browser_fallback_url=${fallback};end`;
  }
  return `https://solflare.com/${path}`;
}

export function openUrl(url: string): void {
  if (typeof window === 'undefined') return;
  // Prefer assign so Solflare/Phantom replace this tab when possible.
  window.location.assign(url);
}

export function openCurrentPageInPhantom(): void {
  const page = window.location.href.split('#')[0]!;
  const ref = window.location.origin;
  openUrl(buildPhantomBrowseUrl(page, ref));
}

export function openCurrentPageInSolflare(): void {
  const page = window.location.href.split('#')[0]!;
  const ref = window.location.origin;
  openUrl(buildSolflareBrowseUrl(page, ref));
}

export function isMwaWalletNotFoundMessage(msg: string): boolean {
  return /no installed wallet|supports the mobile wallet protocol|can't find a wallet|cannot find a wallet/i.test(
    msg
  );
}
