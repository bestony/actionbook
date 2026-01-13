import { describe, it, expect } from 'vitest'
import {
  normalizeActionId,
  urlSimilarity,
  isValidActionId,
  parseActionId,
  generateActionId,
} from '../lib/action-id'

describe('action-id utilities', () => {
  describe('normalizeActionId', () => {
    it('should return original input as first candidate', () => {
      const result = normalizeActionId('releases.rs')
      expect(result[0]).toBe('releases.rs')
    })

    it('should add https:// prefix variations', () => {
      const result = normalizeActionId('releases.rs')
      expect(result).toContain('https://releases.rs')
      expect(result).toContain('https://releases.rs/')
    })

    it('should add www. variations', () => {
      const result = normalizeActionId('example.com')
      expect(result).toContain('https://www.example.com')
      expect(result).toContain('https://www.example.com/')
    })

    it('should not add prefix if already has protocol', () => {
      const result = normalizeActionId('https://releases.rs/')
      // Should only return the original
      expect(result).toEqual(['https://releases.rs/'])
    })

    it('should handle http:// protocol', () => {
      const result = normalizeActionId('http://example.com')
      expect(result).toEqual(['http://example.com'])
    })

    it('should handle URL with path', () => {
      const result = normalizeActionId('releases.rs/docs')
      expect(result).toContain('https://releases.rs/docs')
      expect(result).toContain('https://releases.rs/docs/')
    })
  })

  describe('urlSimilarity', () => {
    it('should return 1 for exact match (ignoring protocol and trailing slash)', () => {
      expect(urlSimilarity('releases.rs', 'https://releases.rs/')).toBe(1)
      expect(urlSimilarity('https://releases.rs', 'https://releases.rs/')).toBe(1)
      expect(urlSimilarity('releases.rs/', 'https://releases.rs')).toBe(1)
    })

    it('should return score based on length ratio for partial matches', () => {
      // input: "releases.rs" (11 chars after normalization)
      // url: "https://releases.rs/docs" -> "releases.rs/docs" (16 chars)
      // score = 11 / 16 = 0.6875
      const score = urlSimilarity('releases.rs', 'https://releases.rs/docs')
      expect(score).toBeCloseTo(11 / 16, 2)
    })

    it('should return 0 when input is not contained in URL', () => {
      expect(urlSimilarity('github.com', 'https://releases.rs/')).toBe(0)
    })

    it('should handle URL with query string', () => {
      const score = urlSimilarity('example.com', 'https://example.com/page?query=1')
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThan(1)
    })

    it('should prefer shorter URLs (higher similarity score)', () => {
      const score1 = urlSimilarity('releases.rs', 'https://releases.rs/')
      const score2 = urlSimilarity('releases.rs', 'https://releases.rs/docs/v1')
      expect(score1).toBeGreaterThan(score2)
    })
  })

  describe('isValidActionId (fuzzy)', () => {
    it('should accept full URL', () => {
      expect(isValidActionId('https://releases.rs/')).toBe(true)
    })

    it('should accept domain without protocol', () => {
      expect(isValidActionId('releases.rs')).toBe(true)
    })

    it('should accept domain with path', () => {
      expect(isValidActionId('releases.rs/docs')).toBe(true)
    })

    it('should reject random strings', () => {
      expect(isValidActionId('invalid')).toBe(false)
      expect(isValidActionId('123')).toBe(false)
      expect(isValidActionId('')).toBe(false)
    })

    it('should accept URL with chunk fragment', () => {
      expect(isValidActionId('https://releases.rs/#chunk-1')).toBe(true)
      expect(isValidActionId('releases.rs#chunk-2')).toBe(true)
    })
  })

  // Existing tests for parseActionId and generateActionId
  describe('parseActionId', () => {
    it('should parse URL without chunk', () => {
      const result = parseActionId('https://example.com/page')
      expect(result).toEqual({
        documentUrl: 'https://example.com/page',
        chunkIndex: 0,
      })
    })

    it('should parse URL with chunk fragment', () => {
      const result = parseActionId('https://example.com/page#chunk-1')
      expect(result).toEqual({
        documentUrl: 'https://example.com/page',
        chunkIndex: 1,
      })
    })

    it('should treat non-chunk fragments as part of URL', () => {
      const result = parseActionId('https://example.com/page#section')
      expect(result).toEqual({
        documentUrl: 'https://example.com/page#section',
        chunkIndex: 0,
      })
    })
  })

  describe('generateActionId', () => {
    it('should generate URL for chunk 0', () => {
      expect(generateActionId('https://example.com/page', 0)).toBe(
        'https://example.com/page'
      )
    })

    it('should generate URL with fragment for chunk > 0', () => {
      expect(generateActionId('https://example.com/page', 1)).toBe(
        'https://example.com/page#chunk-1'
      )
    })
  })
})
