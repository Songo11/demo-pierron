/**
 * Open the current dapp URL inside Phantom / Solflare in-app browsers.
 *
 * Vanadium / GrapheneOS often block Mobile Wallet Adapter package discovery
 * ("FOUND NO INSTALLED WALLET…"). Browse deeplinks bypass that: the wallet
 * injects window.solana / Wallet Standard inside its own browser.
 */

export function isAndroidUserAgent(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /android/i.test(ua);
}

function encodeBrowseTarget(url: string): string {
  return encodeURIComponent(url);
}

/** Phantom browse — Android uses intent:// so Vanadium/Firefox actually hand off to the app. */
export function buildPhantomBrowseUrl(pageUrl: string, refUrl: string): string {
  const path = `ul/browse/${encodeBrowseTarget(pageUrl)}?ref=${encodeBrowseTarget(refUrl)}`;
  if (isAndroidUserAgent()) {
    const fallback = encodeURIComponent('https://play.google.com/store/apps/details?id=app.phantom');
    return `intent://${path}#Intent;scheme=https;host=phantom.app;package=app.phantom;S.browser_fallback_url=${fallback};end`;
  }
  return `https://phantom.app/${path}`;
}

/** Solflare browse universal link (+ Android intent when possible). */
export function buildSolflareBrowseUrl(pageUrl: string, refUrl: string): string {
  const path = `ul/v1/browse/${encodeBrowseTarget(pageUrl)}?ref=${encodeBrowseTarget(refUrl)}`;
  if (isAndroidUserAgent()) {
    const fallback = encodeURIComponent('https://play.google.com/store/apps/details?id=com.solflare.mobile');
    return `intent://${path}#Intent;scheme=https;host=solflare.com;package=com.solflare.mobile;S.browser_fallback_url=${fallback};end`;
  }
  return `https://solflare.com/${path}`;
}

export function openUrl(url: string): void {
  if (typeof window === 'undefined') return;
  window.location.assign(url);
}

export function openCurrentPageInPhantom(): void {
  const page = window.location.href;
  const ref = window.location.origin;
  openUrl(buildPhantomBrowseUrl(page, ref));
}

export function openCurrentPageInSolflare(): void {
  const page = window.location.href;
  const ref = window.location.origin;
  openUrl(buildSolflareBrowseUrl(page, ref));
}

export function isMwaWalletNotFoundMessage(msg: string): boolean {
  return /no installed wallet|supports the mobile wallet protocol|can't find a wallet|cannot find a wallet/i.test(
    msg
  );
}
