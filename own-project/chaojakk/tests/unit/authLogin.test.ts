import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit tests of the sign-in logic in `auth.service.ts` (login and the 2FA step).
 *
 * Every collaborator is replaced by a test double, so nothing here touches
 * PostgreSQL, argon2 or the clock:
 *
 *   prisma         STUB   - answers with the rows a test chooses (indirect input)
 *   verifyPassword STUB   - says "password ok" or "password wrong"
 *   verifyTotp     STUB   - says "code ok" or "code wrong"
 *   recordAudit    SPY    - records the audit rows so a test can read them afterwards
 *   issueToken     MOCK   - the test states how it must be called (and that it must NOT be)
 *   the 2FA race tests use a small in-memory FAKE of the two tables involved
 *
 * Case ids (UT-L = login, UT-R = redeem the 2FA challenge) are the ones in
 * docs/vv-unit-test-design.md.
 */
const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  providerProfile: { findFirst: vi.fn() },
  twoFactorChallenge: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  userTwoFactor: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}))

vi.mock('../../src/db/prisma.js', () => ({ prisma: prismaMock }))
vi.mock('../../src/lib/password.js', () => ({ hashPassword: vi.fn(), verifyPassword: vi.fn() }))
vi.mock('../../src/lib/tokens.js', () => ({ issueToken: vi.fn() }))
vi.mock('../../src/lib/totp.js', () => ({ verifyTotp: vi.fn() }))
vi.mock('../../src/lib/mailer.js', () => ({ passwordResetMail: vi.fn(), sendMail: vi.fn() }))
vi.mock('../../src/lib/audit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/audit.js')>()),
  recordAudit: vi.fn(),
}))
vi.mock('../../src/serializers/user.js', () => ({
  userSelect: {},
  serializeUser: (user: { id: bigint; email: string; role: string }) => ({
    id: String(user.id),
    email: user.email,
    role: user.role,
  }),
}))

import { ValidationError } from '../../src/lib/errors.js'
import { recordAudit } from '../../src/lib/audit.js'
import { decrypt, encrypt, sha256 } from '../../src/lib/crypto.js'
import { verifyPassword } from '../../src/lib/password.js'
import { issueToken } from '../../src/lib/tokens.js'
import { verifyTotp } from '../../src/lib/totp.js'
import { login, redeemTwoFactorChallenge } from '../../src/modules/auth/auth.service.js'

const context = { ip: '203.0.113.7', userAgent: 'vitest' } as never

const issueTokenMock = vi.mocked(issueToken)
const verifyPasswordMock = vi.mocked(verifyPassword)
const verifyTotpMock = vi.mocked(verifyTotp)
const recordAuditMock = vi.mocked(recordAudit)

/** A user row as the login lookup returns it, with random (Faker) details that no test depends on. */
function aUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(faker.number.int({ min: 1, max: 1_000_000 })),
    email: faker.internet.email().toLowerCase(),
    role: 'customer',
    status: 'active',
    passwordHash: '$argon2id$stub',
    twoFactor: null,
    ...overrides,
  }
}

const fixedToken = { plainText: 'plain-token', expiresAt: new Date('2026-12-31T00:00:00.000Z') }

beforeEach(() => {
  vi.resetAllMocks()
  faker.seed(20261005)
  issueTokenMock.mockResolvedValue(fixedToken as never)
  verifyPasswordMock.mockResolvedValue(true)
})

describe('login', () => {
  describe('happy path', () => {
    it('UT-L1: an active customer with the right password gets a session and a token', async () => {
      const user = aUserRow()
      prismaMock.user.findFirst.mockResolvedValue(user)

      const result = await login({ email: user.email, password: 'whatever-it-is' }, context)

      expect(result).toEqual({
        kind: 'session',
        session: {
          user: { id: String(user.id), email: user.email, role: 'customer' },
          token: { access_token: 'plain-token', token_type: 'Bearer', expires_at: fixedToken.expiresAt.toISOString() },
        },
      })
    })

    it('UT-L2 (mock): asks for exactly one token, for this user, this app and this role', async () => {
      const user = aUserRow({ role: 'provider' })
      prismaMock.user.findFirst.mockResolvedValue(user)

      await login({ email: user.email, password: 'x' }, context)

      expect(issueTokenMock).toHaveBeenCalledTimes(1)
      expect(issueTokenMock).toHaveBeenCalledWith(user.id, 'chaojakk-pwa', context, 'provider')
    })

    it('UT-L3 (spy): writes one "login_succeeded" audit row', async () => {
      const user = aUserRow()
      prismaMock.user.findFirst.mockResolvedValue(user)

      await login({ email: user.email, password: 'x' }, context)

      expect(recordAuditMock).toHaveBeenCalledTimes(1)
      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: user.id, action: 'auth.login_succeeded' }),
      )
    })
  })

  describe('alternative / failure paths', () => {
    it('UT-L4: a wrong password is refused with the generic Thai message and no token', async () => {
      const user = aUserRow()
      prismaMock.user.findFirst.mockResolvedValue(user)
      verifyPasswordMock.mockResolvedValue(false)

      const attempt = login({ email: user.email, password: 'wrong' }, context)

      await expect(attempt).rejects.toThrow(ValidationError)
      await expect(attempt).rejects.toMatchObject({ errors: { email: ['อีเมลหรือรหัสผ่านไม่ถูกต้อง'] } })
      expect(issueTokenMock).not.toHaveBeenCalled()
    })

    it('UT-L5 (spy): the failed attempt is audited with a HASH of the identifier, never the email itself', async () => {
      const user = aUserRow()
      prismaMock.user.findFirst.mockResolvedValue(user)
      verifyPasswordMock.mockResolvedValue(false)

      await login({ email: `  ${user.email.toUpperCase()}  `, password: 'wrong' }, context).catch(() => undefined)

      const row = recordAuditMock.mock.calls[0]![0]
      expect(row.action).toBe('auth.login_failed')
      expect(row.metadata).toEqual({ identifier_hash: sha256(user.email), reason: 'invalid_credentials' })
      expect(JSON.stringify(row.metadata)).not.toContain(user.email)
    })

    it('UT-L6: an identifier nobody owns gives the SAME message as a wrong password', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null)
      verifyPasswordMock.mockResolvedValue(false)

      const attempt = login({ email: faker.internet.email(), password: 'x' }, context)

      await expect(attempt).rejects.toMatchObject({ errors: { email: ['อีเมลหรือรหัสผ่านไม่ถูกต้อง'] } })
    })

    it('UT-L7: password is checked even when the user does not exist (so the reply takes the same time)', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null)
      verifyPasswordMock.mockResolvedValue(false)

      await login({ email: faker.internet.email(), password: 'x' }, context).catch(() => undefined)

      expect(verifyPasswordMock).toHaveBeenCalledTimes(1)
      expect(verifyPasswordMock).toHaveBeenCalledWith(null, 'x')
    })

    it('UT-L8: a suspended account cannot sign in even with the right password', async () => {
      const user = aUserRow({ status: 'suspended' })
      prismaMock.user.findFirst.mockResolvedValue(user)

      const attempt = login({ email: user.email, password: 'x' }, context)

      await expect(attempt).rejects.toMatchObject({ errors: { email: ['บัญชีนี้ยังไม่พร้อมใช้งาน'] } })
      expect(issueTokenMock).not.toHaveBeenCalled()
      expect(recordAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { reason: 'account_inactive' } }),
      )
    })
  })

  describe('how the account is looked up (stubbed database, the query is the thing under test)', () => {
    it('UT-L9: a phone number typed with dashes also matches the digits-only number that is stored', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null)
      verifyPasswordMock.mockResolvedValue(false)

      await login({ email: '081-234-5678', password: 'x' }, context).catch(() => undefined)

      const where = prismaMock.user.findFirst.mock.calls[0]![0].where
      expect(where.OR).toEqual(
        expect.arrayContaining([{ phone: '081-234-5678' }, { phone: '0812345678' }]),
      )
    })

    it('UT-L10: the email is lower-cased and trimmed before it is looked up', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null)
      verifyPasswordMock.mockResolvedValue(false)

      await login({ email: '  Somchai@Example.TEST ', password: 'x' }, context).catch(() => undefined)

      const where = prismaMock.user.findFirst.mock.calls[0]![0].where
      expect(where.OR).toEqual(expect.arrayContaining([{ email: 'somchai@example.test' }]))
    })

    it('UT-L11: a 13-digit national id with dashes falls back to the provider profile, by HASH', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null)
      const owner = aUserRow({ role: 'provider' })
      prismaMock.providerProfile.findFirst.mockResolvedValue({ user: owner })

      const result = await login({ email: '1-1017-00123-45-6', password: 'x' }, context)

      const where = prismaMock.providerProfile.findFirst.mock.calls[0]![0].where
      expect(JSON.stringify(where)).toContain(sha256('1101700123456'))
      expect(JSON.stringify(where)).not.toContain('1101700123456"')
      expect(result.kind).toBe('session')
    })

    it('UT-L12: the portal narrows the search to that role', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null)
      verifyPasswordMock.mockResolvedValue(false)

      await login({ email: 'a@example.test', password: 'x', portal: 'admin' }, context).catch(() => undefined)

      expect(prismaMock.user.findFirst.mock.calls[0]![0].where).toMatchObject({ role: 'admin' })
    })
  })

  describe('two-factor authentication switched on', () => {
    it('UT-L13: no token yet - a challenge is returned and only its hash is stored', async () => {
      const user = aUserRow({ twoFactor: { confirmedAt: new Date('2026-01-01T00:00:00.000Z') } })
      prismaMock.user.findFirst.mockResolvedValue(user)

      const result = await login({ email: user.email, password: 'x' }, context)

      expect(result.kind).toBe('two_factor_required')
      expect(issueTokenMock).not.toHaveBeenCalled()
      const stored = prismaMock.twoFactorChallenge.create.mock.calls[0]![0].data
      const challenge = (result as { challenge: string }).challenge
      expect(stored.challengeHash).toBe(sha256(challenge))
      expect(Object.values(stored).map(String)).not.toContain(challenge)
    })

    it('UT-L14: the challenge lives for five minutes', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-05T10:00:00.000Z') })
      const user = aUserRow({ twoFactor: { confirmedAt: new Date('2026-01-01T00:00:00.000Z') } })
      prismaMock.user.findFirst.mockResolvedValue(user)

      const result = await login({ email: user.email, password: 'x' }, context)

      expect(result).toMatchObject({ expiresAt: new Date('2026-10-05T10:05:00.000Z') })
      vi.useRealTimers()
    })

    it('UT-L15: an enrolment that was never confirmed does not turn the second step on', async () => {
      const user = aUserRow({ twoFactor: { confirmedAt: null } })
      prismaMock.user.findFirst.mockResolvedValue(user)

      const result = await login({ email: user.email, password: 'x' }, context)

      expect(result.kind).toBe('session')
    })
  })

  describe('data generated by Faker', () => {
    it.each([1, 2, 3, 4, 5])('UT-L16: any active customer with any password gets a session (faker seed %i)', async (seed) => {
      faker.seed(seed)
      const user = aUserRow({ email: faker.internet.email().toLowerCase() })
      prismaMock.user.findFirst.mockResolvedValue(user)

      const result = await login({ email: user.email, password: faker.internet.password({ length: 12 }) }, context)

      expect(result.kind).toBe('session')
      expect(verifyPasswordMock).toHaveBeenCalledWith(user.passwordHash, expect.any(String))
    })
  })
})

/**
 * A tiny in-memory FAKE of the two tables the 2FA step reads and writes.
 *
 * It follows the same rule as PostgreSQL for the one thing that matters here:
 * `updateMany({ where })` changes a row only if the row STILL matches `where`
 * at that moment, and answers how many rows it changed. That is what makes
 * "two requests at the same time" testable without a database.
 */
function fakeTwoFactorTables(options: {
  challenges: { id: bigint; userId: bigint; hash: string }[]
  user: ReturnType<typeof aUserRow>
  recoveryCodes?: string[]
}) {
  const challengeRows = options.challenges.map((c) => ({
    id: c.id,
    userId: c.userId,
    challengeHash: c.hash,
    expiresAt: new Date(Date.now() + 5 * 60_000),
    consumedAt: null as Date | null,
  }))
  const twoFactor = {
    userId: options.user.id,
    secretEncrypted: encrypt('JBSWY3DPEHPK3PXP'),
    recoveryCodesEncrypted: encrypt(JSON.stringify(options.recoveryCodes ?? [])),
    confirmedAt: new Date('2026-01-01T00:00:00.000Z'),
  }

  prismaMock.twoFactorChallenge.findUnique.mockImplementation(async ({ where }) => {
    const row = challengeRows.find((r) => r.challengeHash === where.challengeHash)
    return row ? { ...row } : null
  })
  prismaMock.twoFactorChallenge.update.mockImplementation(async ({ where, data }) => {
    const row = challengeRows.find((r) => r.id === where.id)!
    Object.assign(row, data)
    return { ...row }
  })
  prismaMock.twoFactorChallenge.updateMany.mockImplementation(async ({ where, data }) => {
    const row = challengeRows.find((r) => r.id === where.id)
    if (!row || ('consumedAt' in where && where.consumedAt === null && row.consumedAt !== null)) return { count: 0 }
    Object.assign(row, data)
    return { count: 1 }
  })
  prismaMock.user.findUnique.mockImplementation(async () => ({ ...options.user, twoFactor }))
  prismaMock.userTwoFactor.findUnique.mockImplementation(async () => ({
    recoveryCodesEncrypted: twoFactor.recoveryCodesEncrypted,
  }))
  prismaMock.userTwoFactor.update.mockImplementation(async ({ data }) => {
    Object.assign(twoFactor, data)
    return twoFactor
  })
  prismaMock.userTwoFactor.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.recoveryCodesEncrypted !== twoFactor.recoveryCodesEncrypted) return { count: 0 }
    Object.assign(twoFactor, data)
    return { count: 1 }
  })

  return { challengeRows, twoFactor }
}

describe('redeemTwoFactorChallenge', () => {
  const user = aUserRow({ id: 7n, role: 'admin' })

  describe('happy and failure paths', () => {
    it('UT-R1: a valid challenge with a right code gives a session and the challenge is marked used', async () => {
      const tables = fakeTwoFactorTables({ challenges: [{ id: 1n, userId: user.id, hash: sha256('c1') }], user })
      verifyTotpMock.mockReturnValue(true)

      const session = await redeemTwoFactorChallenge({ challenge: 'c1', code: '123456' }, context)

      expect(session.token.access_token).toBe('plain-token')
      expect(tables.challengeRows[0]!.consumedAt).toBeInstanceOf(Date)
      expect(issueTokenMock).toHaveBeenCalledWith(user.id, 'chaojakk-pwa', context, 'admin')
    })

    it('UT-R2: a wrong code is refused, audited, and the challenge stays usable for another try', async () => {
      const tables = fakeTwoFactorTables({ challenges: [{ id: 1n, userId: user.id, hash: sha256('c1') }], user })
      verifyTotpMock.mockReturnValue(false)

      const attempt = redeemTwoFactorChallenge({ challenge: 'c1', code: '000000' }, context)

      await expect(attempt).rejects.toMatchObject({ errors: { code: ['รหัสไม่ถูกต้อง'] } })
      expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.two_factor_failed' }))
      expect(tables.challengeRows[0]!.consumedAt).toBeNull()
      expect(issueTokenMock).not.toHaveBeenCalled()
    })

    it('UT-R3: a challenge nobody issued is refused as expired', async () => {
      fakeTwoFactorTables({ challenges: [], user })

      const attempt = redeemTwoFactorChallenge({ challenge: 'unknown', code: '123456' }, context)

      await expect(attempt).rejects.toMatchObject({ errors: { code: ['เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'] } })
    })

    it('UT-R4: a challenge older than five minutes is refused as expired', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-05T10:00:00.000Z') })
      const tables = fakeTwoFactorTables({ challenges: [{ id: 1n, userId: user.id, hash: sha256('c1') }], user })
      verifyTotpMock.mockReturnValue(true)

      vi.setSystemTime(new Date('2026-10-05T10:05:01.000Z'))
      const attempt = redeemTwoFactorChallenge({ challenge: 'c1', code: '123456' }, context)

      await expect(attempt).rejects.toThrow(ValidationError)
      expect(tables.challengeRows[0]!.consumedAt).toBeNull()
      vi.useRealTimers()
    })

    it('UT-R5: a recovery code works once, is removed from the list, and is accepted in lower case', async () => {
      const tables = fakeTwoFactorTables({
        challenges: [{ id: 1n, userId: user.id, hash: sha256('c1') }],
        user,
        recoveryCodes: ['ABCDE-FGHJK', 'MNPQR-STUVW'],
      })
      verifyTotpMock.mockReturnValue(false)

      await redeemTwoFactorChallenge({ challenge: 'c1', code: 'abcde-fghjk' }, context)

      expect(JSON.parse(decrypt(tables.twoFactor.recoveryCodesEncrypted))).toEqual(['MNPQR-STUVW'])
    })
  })

  describe('V&V: defects found by reading the code (these fail on the original code)', () => {
    it('UT-R6: the same challenge, redeemed twice at the same moment, gives only ONE token', async () => {
      fakeTwoFactorTables({ challenges: [{ id: 1n, userId: user.id, hash: sha256('c1') }], user })
      verifyTotpMock.mockReturnValue(true)

      const results = await Promise.allSettled([
        redeemTwoFactorChallenge({ challenge: 'c1', code: '123456' }, context),
        redeemTwoFactorChallenge({ challenge: 'c1', code: '123456' }, context),
      ])

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(issueTokenMock).toHaveBeenCalledTimes(1)
    })

    it('UT-R7: one recovery code, used on two challenges at the same moment, logs in only ONE of them', async () => {
      fakeTwoFactorTables({
        challenges: [
          { id: 1n, userId: user.id, hash: sha256('c1') },
          { id: 2n, userId: user.id, hash: sha256('c2') },
        ],
        user,
        recoveryCodes: ['ABCDE-FGHJK'],
      })
      verifyTotpMock.mockReturnValue(false)

      const results = await Promise.allSettled([
        redeemTwoFactorChallenge({ challenge: 'c1', code: 'ABCDE-FGHJK' }, context),
        redeemTwoFactorChallenge({ challenge: 'c2', code: 'ABCDE-FGHJK' }, context),
      ])

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    })

    it('UT-R8: an account suspended after the password step cannot finish signing in', async () => {
      const suspended = aUserRow({ id: 7n, status: 'suspended' })
      fakeTwoFactorTables({ challenges: [{ id: 1n, userId: suspended.id, hash: sha256('c1') }], user: suspended })
      verifyTotpMock.mockReturnValue(true)

      const attempt = redeemTwoFactorChallenge({ challenge: 'c1', code: '123456' }, context)

      await expect(attempt).rejects.toThrow(ValidationError)
      expect(issueTokenMock).not.toHaveBeenCalled()
    })
  })
})
