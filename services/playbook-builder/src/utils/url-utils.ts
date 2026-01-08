/**
 * URL utility functions for playbook-builder
 */

/**
 * Normalize URL for comparison (remove trailing slash, fragment, etc.)
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove fragment and trailing slash
    let normalized = `${parsed.origin}${parsed.pathname}${parsed.search}`;
    if (normalized.endsWith('/') && normalized.length > 1) {
      normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Check if URL is same domain as base URL
 */
export function isSameDomain(url: string, baseUrl: string): boolean {
  try {
    const urlHost = new URL(url).hostname;
    const baseHost = new URL(baseUrl).hostname;
    return urlHost === baseHost;
  } catch {
    return false;
  }
}
