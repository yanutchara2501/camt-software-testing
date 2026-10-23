import { describe, expect, it } from 'vitest'
import { HttpError } from '../../src/lib/errors.js'
import { parseId } from '../../src/lib/params.js'

/**
 * Route ids.
 *
 * Part of this file is a CHARACTERIZATION: it records what `parseId` does today,
 * including answers that look odd (marked WEIRD). Nothing here has been fixed.
 * The odd ones are written down so that they become a visible list of
 * follow-ups, and so that a later change to them is a decision and not an
 * accident.
 */
describe('parseId', () => {
  describe('ids it accepts', () => {
    it.each([
      ['a string of digits', '42', 42n],
      ['a number', 42, 42n],
      ['the smallest valid id', '1', 1n],
      ['a large id that is still a safe integer', '9007199254740991', 9007199254740991n],
    ])('turns %s into a BigInt', (_label, value, expected) => {
      expect(parseId(value)).toBe(expected)
    })
  })

  describe('ids it refuses', () => {
    it.each([
      ['zero', '0'],
      ['a negative number', '-1'],
      ['a fraction', '1.5'],
      ['letters', 'abc'],
      ['an empty string', ''],
      ['undefined', undefined],
      ['null', null],
      ['NaN', Number.NaN],
      ['infinity', 'Infinity'],
    ])('answers 404 "not found" for %s', (_label, value) => {
      const attempt = () => parseId(value)

      expect(attempt).toThrow(HttpError)
      expect(attempt).toThrow(expect.objectContaining({ status: 404, message: 'ไม่พบข้อมูลที่ต้องการ' }))
    })
  })

  describe('WEIRD behaviours that are recorded, not fixed', () => {
    it('WEIRD: accepts exponent notation, so "1e3" is booking 1000', () => {
      expect(parseId('1e3')).toBe(1000n)
    })

    it('WEIRD: accepts hexadecimal text, so "0x10" is id 16', () => {
      expect(parseId('0x10')).toBe(16n)
    })

    it('WEIRD: ignores spaces around the digits', () => {
      expect(parseId(' 7 ')).toBe(7n)
    })

    it('WEIRD: past 2^53 it quietly turns into a neighbouring id (9007199254740993 becomes ...992)', () => {
      expect(parseId('9007199254740993')).toBe(9007199254740992n)
    })
  })
})
