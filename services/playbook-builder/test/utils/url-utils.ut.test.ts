/**
 * URL Utility Functions - Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { normalizeUrl, isSameDomain } from '../../src/utils/url-utils.js';

describe('normalizeUrl', () => {
  describe('basic normalization', () => {
    it('removes trailing slash', () => {
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
      expect(normalizeUrl('https://example.com/page/')).toBe('https://example.com/page');
    });

    it('preserves URL without trailing slash', () => {
      expect(normalizeUrl('https://example.com')).toBe('https://example.com');
      expect(normalizeUrl('https://example.com/page')).toBe('https://example.com/page');
    });

    it('converts to lowercase', () => {
      expect(normalizeUrl('https://Example.COM/Page')).toBe('https://example.com/page');
    });

    it('preserves query parameters', () => {
      expect(normalizeUrl('https://example.com/search?q=test')).toBe('https://example.com/search?q=test');
    });

    it('removes fragment (hash)', () => {
      expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
    });
  });

  describe('edge cases', () => {
    it('handles root path correctly', () => {
      // Root path should just be the origin
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
    });

    it('handles complex URLs', () => {
      const url = 'https://Example.COM/Path/To/Page?param=value&other=1#section';
      expect(normalizeUrl(url)).toBe('https://example.com/path/to/page?param=value&other=1');
    });

    it('handles invalid URLs gracefully', () => {
      expect(normalizeUrl('not-a-valid-url')).toBe('not-a-valid-url');
      expect(normalizeUrl('')).toBe('');
    });

    it('handles URLs with ports', () => {
      expect(normalizeUrl('https://example.com:8080/page/')).toBe('https://example.com:8080/page');
    });

    it('handles different protocols', () => {
      expect(normalizeUrl('http://example.com/page')).toBe('http://example.com/page');
    });
  });

  describe('deduplication scenarios', () => {
    it('normalizes equivalent URLs to same value', () => {
      const urls = [
        'https://example.com/page',
        'https://example.com/page/',
        'https://EXAMPLE.COM/page',
        'https://Example.Com/Page/',
      ];

      const normalized = urls.map(normalizeUrl);
      expect(new Set(normalized).size).toBe(1);
      expect(normalized[0]).toBe('https://example.com/page');
    });

    it('distinguishes different paths', () => {
      expect(normalizeUrl('https://example.com/page1')).not.toBe(
        normalizeUrl('https://example.com/page2')
      );
    });

    it('distinguishes different query params', () => {
      expect(normalizeUrl('https://example.com/search?q=a')).not.toBe(
        normalizeUrl('https://example.com/search?q=b')
      );
    });
  });
});

describe('isSameDomain', () => {
  describe('same domain detection', () => {
    it('returns true for same domain', () => {
      expect(isSameDomain('https://example.com/page1', 'https://example.com/page2')).toBe(true);
    });

    it('returns true regardless of protocol', () => {
      expect(isSameDomain('http://example.com/page', 'https://example.com/')).toBe(true);
    });

    it('returns true regardless of port', () => {
      expect(isSameDomain('https://example.com:8080/page', 'https://example.com/')).toBe(true);
    });

    it('returns true for different paths on same domain', () => {
      expect(isSameDomain('https://example.com/a/b/c', 'https://example.com/')).toBe(true);
    });
  });

  describe('different domain detection', () => {
    it('returns false for different domains', () => {
      expect(isSameDomain('https://other.com/page', 'https://example.com/')).toBe(false);
    });

    it('returns false for subdomains', () => {
      expect(isSameDomain('https://sub.example.com/', 'https://example.com/')).toBe(false);
    });

    it('returns false for different TLDs', () => {
      expect(isSameDomain('https://example.org/', 'https://example.com/')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for invalid URLs', () => {
      expect(isSameDomain('not-a-url', 'https://example.com/')).toBe(false);
      expect(isSameDomain('https://example.com/', 'not-a-url')).toBe(false);
      expect(isSameDomain('', '')).toBe(false);
    });

    it('handles case insensitivity', () => {
      expect(isSameDomain('https://EXAMPLE.COM/page', 'https://example.com/')).toBe(true);
    });
  });
});
