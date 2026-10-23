import { authenticator } from 'otplib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateRecoveryCodes, generateSecret, otpauthUri, verifyTotp } from '../../src/lib/totp.js'

/**
 * Two-factor codes, checked against a clock that stands still.
 *
 * `verifyTotp` is the last gate between a stolen password and an admin account,
 * and until now it was only exercised through the sign-in routes. These tests
 * pin down the rules of the function itself:
 *
 *  - the window is one 30-second step either side (a phone with a slightly
 *    skewed clock still works), and not two;
 *  - a malformed code or secret is a failed check, never an exception that
 *    would turn into a 500 on the sign-in page.
 *
 * Time is frozen at a moment that is an exact multiple of 30 seconds, so "the
 * previous step" and "the next step" are unambiguous instead of depending on
 * when the test happened to start.
 */
const STEP_START = new Date('2026-10-05T10:00:00.000Z')
const STEP_MS = 30_000

function at(offsetSteps: number) {
  vi.setSystemTime(new Date(STEP_START.getTime() + offsetSteps * STEP_MS))
}

describe('verifyTotp', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts the code of the current step', () => {
    vi.useFakeTimers({ now: STEP_START })
    const secret = generateSecret()
    const code = authenticator.generate(secret)

    expect(verifyTotp(secret, code)).toBe(true)
  })

  it('accepts the code of the step just before (the phone clock is a little slow)', () => {
    vi.useFakeTimers({ now: STEP_START })
    const secret = generateSecret()
    const code = authenticator.generate(secret)

    at(1)

    expect(verifyTotp(secret, code)).toBe(true)
  })

  it('accepts the code of the step just after (the phone clock is a little fast)', () => {
    vi.useFakeTimers({ now: STEP_START })
    const secret = generateSecret()
    at(1)
    const codeFromTheFuture = authenticator.generate(secret)

    at(0)

    expect(verifyTotp(secret, codeFromTheFuture)).toBe(true)
  })

  it('rejects a code that is two steps old', () => {
    vi.useFakeTimers({ now: STEP_START })
    const secret = generateSecret()
    const code = authenticator.generate(secret)

    at(2)

    expect(verifyTotp(secret, code)).toBe(false)
  })

  it('rejects a code that is two steps in the future', () => {
    vi.useFakeTimers({ now: STEP_START })
    const secret = generateSecret()
    at(2)
    const code = authenticator.generate(secret)

    at(0)

    expect(verifyTotp(secret, code)).toBe(false)
  })

  it('ignores the spaces an authenticator app puts in the middle of a code', () => {
    vi.useFakeTimers({ now: STEP_START })
    const secret = generateSecret()
    const code = authenticator.generate(secret)
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`

    expect(verifyTotp(secret, spaced)).toBe(true)
  })

  it('rejects a code made from a different secret', () => {
    vi.useFakeTimers({ now: STEP_START })
    const code = authenticator.generate(generateSecret())

    expect(verifyTotp(generateSecret(), code)).toBe(false)
  })

  it.each([
    ['an empty code', ''],
    ['a code with letters', 'abcdef'],
    ['a code that is too short', '123'],
    ['a code that is too long', '12345678901'],
  ])('answers false, and does not throw, for %s', (_label, code) => {
    vi.useFakeTimers({ now: STEP_START })

    expect(verifyTotp(generateSecret(), code)).toBe(false)
  })

  it('answers false, and does not throw, for a secret that is not base32', () => {
    expect(verifyTotp('this is not a secret!', '123456')).toBe(false)
  })
})

describe('generateSecret', () => {
  it('makes a different secret every time', () => {
    expect(generateSecret()).not.toBe(generateSecret())
  })

  it('makes a base32 string that an authenticator app can store', () => {
    expect(generateSecret()).toMatch(/^[A-Z2-7]+$/)
  })
})

describe('otpauthUri', () => {
  it('names the account, the issuer and the secret in the URI an app scans', () => {
    const secret = generateSecret()

    const uri = otpauthUri('somchai@example.test', secret)

    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain(encodeURIComponent('somchai@example.test'))
    expect(uri).toContain(`secret=${secret}`)
    expect(uri).toContain('issuer=')
  })
})

describe('generateRecoveryCodes', () => {
  // Crockford-style alphabet: no O/0 and no I/1, so a code read off a printed
  // sheet cannot be mistyped as a different character.
  const SHAPE = /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/

  it('makes eight codes by default', () => {
    expect(generateRecoveryCodes()).toHaveLength(8)
  })

  it('can make another number of codes', () => {
    expect(generateRecoveryCodes(3)).toHaveLength(3)
  })

  it('shapes every code as XXXXX-XXXXX without the characters that look alike', () => {
    const codes = generateRecoveryCodes(50)

    expect(codes.filter((code) => !SHAPE.test(code))).toEqual([])
  })

  it('does not repeat a code inside one batch', () => {
    const codes = generateRecoveryCodes(50)

    expect(new Set(codes).size).toBe(codes.length)
  })

  it('makes a new batch each time', () => {
    expect(generateRecoveryCodes()).not.toEqual(generateRecoveryCodes())
  })
})
