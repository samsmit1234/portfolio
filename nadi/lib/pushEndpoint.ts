/**
 * Web Push endpoints are URLs supplied by the browser, and the server POSTs to
 * them. Only accept the real push services, so a forged subscription cannot make
 * the server call arbitrary hosts (SSRF).
 */
const EXACT_HOSTS = new Set(["fcm.googleapis.com"]);
const HOST_SUFFIXES = [
  ".push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  ".push.apple.com", // Safari / iOS (web.push.apple.com)
  ".notify.windows.com", // Edge legacy / WNS (wns2-*.notify.windows.com)
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
