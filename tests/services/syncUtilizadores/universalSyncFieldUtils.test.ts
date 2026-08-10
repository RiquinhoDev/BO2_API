import {
  errorMessage,
  getDocId,
  mongoErrorCode,
  normalizeEmail,
  toDateOrNull,
  toNumber,
} from '../../../src/services/syncUtilizadoresServices/universalSync/fieldUtils'

describe('universalSync fieldUtils', () => {
  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
  })

  describe('getDocId', () => {
    it('prefers _id, falls back to id, and stringifies', () => {
      expect(getDocId({ _id: 42 }, 'X')).toBe('42')
      expect(getDocId({ id: 'abc' }, 'X')).toBe('abc')
    })
    it('throws a labelled error when neither is present', () => {
      expect(() => getDocId({}, 'SyncReport')).toThrow('SyncReport sem _id/id')
    })
  })

  describe('toDateOrNull', () => {
    it('passes through a valid Date', () => {
      const d = new Date('2026-01-02T03:04:05.000Z')
      expect(toDateOrNull(d)).toBe(d)
    })
    it('parses valid strings/numbers and rejects invalid or empty', () => {
      expect(toDateOrNull('2026-01-02')?.toISOString().slice(0, 10)).toBe('2026-01-02')
      expect(toDateOrNull(0)).toBeNull()
      expect(toDateOrNull('not-a-date')).toBeNull()
      expect(toDateOrNull(new Date('invalid'))).toBeNull()
      expect(toDateOrNull(null)).toBeNull()
      expect(toDateOrNull({})).toBeNull()
    })
  })

  describe('toNumber', () => {
    it('coerces finite numbers and numeric strings', () => {
      expect(toNumber(7)).toBe(7)
      expect(toNumber('12.5')).toBe(12.5)
    })
    it('uses the fallback for non-finite or non-numeric input', () => {
      expect(toNumber('abc')).toBe(0)
      expect(toNumber(undefined, 9)).toBe(9)
      expect(toNumber(Infinity, 3)).toBe(3)
      expect(toNumber(NaN, 5)).toBe(5)
    })
  })

  it('errorMessage extracts Error.message or stringifies', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('plain')).toBe('plain')
  })

  describe('mongoErrorCode', () => {
    it('returns a numeric code when present', () => {
      expect(mongoErrorCode({ code: 11000 })).toBe(11000)
    })
    it('returns undefined otherwise', () => {
      expect(mongoErrorCode({ code: 'E11000' })).toBeUndefined()
      expect(mongoErrorCode(new Error('x'))).toBeUndefined()
      expect(mongoErrorCode(null)).toBeUndefined()
    })
  })
})
