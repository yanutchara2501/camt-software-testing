// ==================================================
// ฟีเจอร์: ระบบยืนยันตัวตนและเข้าสู่ระบบ (Auth)
// ไฟล์นี้ทำหน้าที่: รวมตรรกะหลักของการสมัครสมาชิก เข้าสู่ระบบ ยืนยัน 2FA และตั้งรหัสผ่านใหม่ พร้อมออก token ให้ผู้ใช้
// ==================================================
import type { Prisma } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { prisma } from '../../db/prisma.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import { decrypt, encrypt, sha256 } from '../../lib/crypto.js'
import { issueToken, type IssuedToken } from '../../lib/tokens.js'
import { verifyTotp } from '../../lib/totp.js'
import { ValidationError } from '../../lib/errors.js'
import { env } from '../../config/env.js'
import { isDemoAccountEmail } from '../../data/clearDemo.js'
import { namesFromParts } from '../../lib/personName.js'
import { recordAudit, AuditSubject, type AuditContext } from '../../lib/audit.js'
import { serializeUser, userSelect, type UserResource } from '../../serializers/user.js'
import { passwordResetMail, sendMail } from '../../lib/mailer.js'

const CHALLENGE_TTL_MINUTES = 5
const RESET_TOKEN_TTL_MINUTES = 60

/**
 * The terms of service a new account is accepting.
 *
 * Mirrored by `TERMS_VERSION` in the frontend's `src/data/termsPolicy.ts`,
 * which is what the sign-up form prints beside the tick box and what
 * `/terms` serves. The two are held to each other by
 * `tests/unit/termsVersion.test.ts` — they are separate packages with separate
 * builds, so nothing else would notice if one were bumped alone, and an account
 * would start recording acceptance of a document number that does not match the
 * text it was shown.
 *
 * Bump it only alongside a fresh acceptance, never in place: the number is the
 * only durable record of which text somebody agreed to.
 */
export const TERMS_VERSION = '1.0'

/**
 * Which version of the research-consent notice this API stamps onto an account.
 *
 * Mirrors `RESEARCH_CONSENT_VERSION` in the frontend's `data/researchConsent`,
 * held to it by `tests/unit/researchConsentVersion.test.ts` for the reason the
 * terms version has the same guard: separate packages, separate builds, and a
 * consent recorded against a version whose text nobody was shown is not a
 * record of anything.
 */
export const RESEARCH_CONSENT_VERSION = '1.0'

export interface Session {
  user: UserResource
  token: { access_token: string; token_type: 'Bearer'; expires_at: string }
}

function session(user: UserResource, token: IssuedToken): Session {
  return {
    user,
    token: {
      access_token: token.plainText,
      token_type: 'Bearer',
      expires_at: token.expiresAt.toISOString(),
    },
  }
}

export async function register(
  input: {
    first_name: string
    last_name: string
    email: string
    phone: string
    password: string
    role: 'customer' | 'provider'
    terms_version: string
    /** The optional one. Absent and false mean the same thing: no consent. */
    research_consent?: boolean
  },
  context: AuditContext,
): Promise<Session> {
  // The version has to be the one this server is serving. Accepting whatever
  // the client sends would make the stored version decoration: a page cached
  // from before a change would keep recording acceptance of terms its reader
  // never saw, which is exactly the claim the column exists to defend against.
  if (input.terms_version !== TERMS_VERSION) {
    throw new ValidationError({
      terms_version: [
        'ข้อกำหนดและเงื่อนไขมีการปรับปรุง กรุณารีเฟรชหน้าเพื่ออ่านและยอมรับฉบับล่าสุดอีกครั้ง',
      ],
    })
  }

  // Checked explicitly so the caller gets a field-level Thai message rather
  // than the generic unique-constraint response from the error handler.
  const clash = await prisma.user.findFirst({
    where: {
      OR: [
        { email: input.email, role: input.role },
        // Phone remains a person-level identifier and is intentionally global.
        { phone: input.phone },
      ],
    },
    select: { email: true, phone: true },
  })
  if (clash) {
    throw new ValidationError(
      clash.email === input.email
        ? { email: ['อีเมลนี้ถูกใช้งานแล้ว'] }
        : { phone: ['เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว'] },
    )
  }

  const user = await prisma.user.create({
    data: {
      ...namesFromParts(input.first_name, input.last_name),
      email: input.email,
      phone: input.phone,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      termsAcceptedIp: context.ipAddress,
      // Stamped only when they said yes. Declining writes nothing, which is the
      // same state as never having been asked — correct here, because a null
      // means "no consent held" and there is no version of "no" to record.
      ...(input.research_consent
        ? { researchConsentAt: new Date(), researchConsentVersion: RESEARCH_CONSENT_VERSION }
        : {}),
    },
    select: userSelect,
  })

  const token = await issueToken(user.id, 'chaojakk-pwa', context, user.role)

  await recordAudit({
    actorId: user.id,
    action: 'user.registered',
    subjectType: AuditSubject.user,
    subjectId: user.id,
    metadata: { role: user.role },
    context,
  })

  return session(serializeUser(user), token)
}

/**
 * Resolve a login identifier to an account.
 *
 * Accepts email, login id, phone, or — for providers — the national/tax id they
 * registered with, matched against its stored hash so the plaintext identifier
 * never has to be searchable.
 */
async function findUserByIdentifier(
  identifier: string,
  portal?: 'customer' | 'provider' | 'admin',
) {
  const normalized = identifier.toLowerCase()

  /**
   * A telephone number as its digits, which is the only way one is stored.
   *
   * Registration strips separators before writing — see `phoneNumber` in
   * `auth.schema.ts`, which is what made `User.phone` unique in the first
   * place — but the login lookup matched the identifier verbatim. So somebody
   * who signed up typing 081-234-5678 was stored as 0812345678 and then refused
   * every time they typed it back the way they had written it, and told their
   * credentials were wrong. The same stripping on the way in is the whole fix.
   *
   * Only the digits form is added, never substituted: an email or a login id
   * containing digits still has to match itself.
   */
  const digits = identifier.replace(/\D/gu, '')

  const user = await prisma.user.findFirst({
    where: {
      ...(portal ? { role: portal } : {}),
      OR: [
        { email: normalized },
        { loginId: normalized },
        { phone: identifier },
        ...(digits && digits !== identifier ? [{ phone: digits }] : []),
      ],
    },
    select: { ...userSelect, passwordHash: true, twoFactor: { select: { confirmedAt: true } } },
  })
  if (user) return user

  // The card and tax numbers are printed with dashes too, and are stored as
  // digits for the same reason — so the hash has to be taken of the digits.
  if (!/^\d{13}$/.test(digits)) return null

  const identifierHash = sha256(digits)
  const profile = await prisma.providerProfile.findFirst({
    where: {
      ...(portal && portal !== 'provider' ? { user: { role: portal } } : {}),
      OR: [
        { identityDetails: { nationalIdHash: identifierHash } },
        { companyDetails: { taxIdHash: identifierHash } },
      ],
    },
    select: {
      user: {
        select: { ...userSelect, passwordHash: true, twoFactor: { select: { confirmedAt: true } } },
      },
    },
  })

  return profile?.user ?? null
}

/**
 * What a way in can answer.
 *
 * The third is the social route's alone, and it is not an error. Google can
 * prove who somebody is, but proving it does not say what they came to open —
 * and a provider's account is not opened by proving an address, it is opened by
 * an application with documents in it. So an identity nobody has an account for
 * comes back as the address it established, for a sign-up form to start from,
 * rather than as a session.
 */
export type LoginResult =
  | { kind: 'session'; session: Session }
  | { kind: 'two_factor_required'; challenge: string; expiresAt: Date }
  | {
      kind: 'signup_required'
      provider: string
      email: string
      name: string | null
    }

/**
 * The last step of every way in, and the only place a token is minted for one.
 *
 * A second factor is only a second factor if no door skips it. This used to
 * live inline at the end of `login`, so the password route stopped at the
 * challenge and the social route — which mints its own token at the end of
 * `completeSignIn` — walked straight past it. An account with 2FA switched on
 * could be entered through Google without it.
 *
 * Shared rather than duplicated, because a copy is a door that stops being
 * checked the next time somebody edits one of them. `metadata` is what differs
 * between callers: the social route records which provider it came through.
 */
export async function grantAccess(
  user: Parameters<typeof serializeUser>[0] & {
    id: bigint
    twoFactor: { confirmedAt: Date | null } | null
  },
  context: AuditContext,
  metadata: Prisma.InputJsonValue = {},
): Promise<LoginResult> {
  // 2FA on: no token yet. Issue a short-lived challenge the client redeems with
  // a TOTP or recovery code.
  if (user.twoFactor?.confirmedAt) {
    const challenge = randomBytes(36).toString('base64url')
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000)

    await prisma.twoFactorChallenge.create({
      data: { userId: user.id, challengeHash: sha256(challenge), expiresAt },
    })

    await recordAudit({
      actorId: user.id,
      action: 'auth.login_2fa_challenge_issued',
      subjectType: AuditSubject.user,
      subjectId: user.id,
      metadata,
      context,
    })

    return { kind: 'two_factor_required', challenge, expiresAt }
  }

  // A login used to revoke every earlier token, carried over from the Laravel
  // service. That made one session per account the hard limit: signing in on a
  // laptop silently signed out the phone on somebody's home screen, and they
  // had no way to know why. Devices coexist now, and /auth/sessions is where
  // one gets ended deliberately.
  const token = await issueToken(user.id, 'chaojakk-pwa', context, user.role)

  await recordAudit({
    actorId: user.id,
    action: 'auth.login_succeeded',
    subjectType: AuditSubject.user,
    subjectId: user.id,
    metadata,
    context,
  })

  return { kind: 'session', session: session(serializeUser(user), token) }
}

export async function login(
  input: { email: string; password: string; portal?: 'customer' | 'provider' | 'admin' },
  context: AuditContext,
): Promise<LoginResult> {
  const identifier = input.email.trim()
  const user = await findUserByIdentifier(identifier, input.portal)

  /**
   * Verified before the `!user` test, not after it.
   *
   * `||` short-circuits, so writing this the natural way round meant an
   * identifier matching nobody never reached argon2 at all — and the reply came
   * back an order of magnitude faster than a wrong password. Since a 13-digit
   * national or tax ID is an accepted login handle, that answered "is this
   * person a provider on ChaoJakk" to anyone holding the number.
   */
  const passwordMatches = await verifyPassword(user?.passwordHash ?? null, input.password)

  if (!user || !passwordMatches) {
    await recordAudit({
      actorId: user?.id ?? null,
      action: 'auth.login_failed',
      subjectType: AuditSubject.user,
      subjectId: user?.id ?? null,
      // The identifier itself is not stored: a hash is enough to correlate
      // repeated attempts without logging someone's email or phone number.
      metadata: { identifier_hash: sha256(identifier.toLowerCase()), reason: 'invalid_credentials' },
      context,
    })
    throw new ValidationError({ email: ['อีเมลหรือรหัสผ่านไม่ถูกต้อง'] })
  }

  /**
   * A seeded demo account never signs in on production, whatever its password.
   *
   * `prisma/seed.ts` skips these under `NODE_ENV=production` and always has, so
   * one that is live there arrived by another road — a database seeded before
   * that guard, restored from one, or seeded by a shell with no `NODE_ENV`. And
   * a kept showcase leaves the provider ones standing on purpose, because the
   * search page needs somebody to own the machines. Nobody needs to *sign in*
   * as them: they exist to own listings.
   *
   * Which makes this the cheap half of a fix whose other half is an operator's
   * to make. `lockDemoAccounts` is still the remedy and still the only thing
   * that changes a credential — that is a decision for a person, as
   * lib/demoAccountWarning.ts argues at length. This decides nothing and
   * mutates nothing; it declines to open a door that should not have been
   * there, from the next deploy, with no shell and nobody remembering.
   *
   * Refused as bad credentials rather than as a closed account, so somebody
   * holding the password printed in a public repository learns nothing about
   * whether the row is there. The audit row says what really happened.
   */
  if (env.isProduction && isDemoAccountEmail(user.email)) {
    await recordAudit({
      actorId: user.id,
      action: 'auth.login_failed',
      subjectType: AuditSubject.user,
      subjectId: user.id,
      metadata: { reason: 'demo_account_in_production' },
      context,
    })
    throw new ValidationError({ email: ['อีเมลหรือรหัสผ่านไม่ถูกต้อง'] })
  }

  if (user.status !== 'active') {
    await recordAudit({
      actorId: user.id,
      action: 'auth.login_failed',
      subjectType: AuditSubject.user,
      subjectId: user.id,
      metadata: { reason: 'account_inactive' },
      context,
    })
    throw new ValidationError({ email: ['บัญชีนี้ยังไม่พร้อมใช้งาน'] })
  }

  return grantAccess(user, context)
}

/** Second login step: challenge + TOTP or recovery code → a real token. */
export async function redeemTwoFactorChallenge(
  input: { challenge: string; code: string },
  context: AuditContext,
): Promise<Session> {
  const expired = new ValidationError({ code: ['เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'] })

  const challenge = await prisma.twoFactorChallenge.findUnique({
    where: { challengeHash: sha256(input.challenge) },
    select: { id: true, userId: true, expiresAt: true, consumedAt: true },
  })

  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() <= Date.now()) {
    throw expired
  }

  const user = await prisma.user.findUnique({
    where: { id: challenge.userId },
    select: { ...userSelect, twoFactor: { select: { confirmedAt: true, secretEncrypted: true } } },
  })
  if (!user) throw expired

  /**
   * The password step checked this, but five minutes can pass between that step
   * and this one. An account suspended in the gap must not get a token from a
   * challenge that was issued before it was suspended.
   */
  if (user.status !== 'active') {
    await recordAudit({
      actorId: user.id,
      action: 'auth.login_failed',
      subjectType: AuditSubject.user,
      subjectId: user.id,
      metadata: { reason: 'account_inactive' },
      context,
    })
    throw new ValidationError({ code: ['บัญชีนี้ยังไม่พร้อมใช้งาน'] })
  }

  const code = input.code.trim()
  const passes =
    verifySecondFactor(user.twoFactor?.secretEncrypted, code) ||
    (await consumeRecoveryCode(user.id, code))

  if (!passes) {
    await recordAudit({
      actorId: user.id,
      action: 'auth.two_factor_failed',
      subjectType: AuditSubject.user,
      subjectId: user.id,
      context,
    })
    throw new ValidationError({ code: ['รหัสไม่ถูกต้อง'] })
  }

  // Single use: mark it consumed before issuing anything.
  //
  // The check at the top (`consumedAt` is null) and this write are two separate
  // statements, so two requests arriving together could both pass the check.
  // `updateMany` with `consumedAt: null` in the WHERE makes the database decide:
  // only one of them changes a row, and the other is told it changed none.
  const consumed = await prisma.twoFactorChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  if (consumed.count !== 1) throw expired

  const token = await issueToken(user.id, 'chaojakk-pwa', context, user.role)

  await recordAudit({
    actorId: user.id,
    action: 'auth.login_succeeded',
    subjectType: AuditSubject.user,
    subjectId: user.id,
    metadata: { two_factor: true },
    context,
  })

  return session(serializeUser(user), token)
}

/** Only the confirmed secret authenticates; a pending enrolment never does. */
function verifySecondFactor(secretEncrypted: string | null | undefined, code: string): boolean {
  if (!secretEncrypted) return false
  try {
    return verifyTotp(decrypt(secretEncrypted), code)
  } catch {
    return false
  }
}

async function consumeRecoveryCode(userId: bigint, code: string): Promise<boolean> {
  const record = await prisma.userTwoFactor.findUnique({
    where: { userId },
    select: { recoveryCodesEncrypted: true },
  })
  if (!record?.recoveryCodesEncrypted) return false

  let codes: string[]
  try {
    codes = JSON.parse(decrypt(record.recoveryCodesEncrypted)) as string[]
  } catch {
    return false
  }

  const normalized = code.toUpperCase()
  if (!codes.includes(normalized)) return false

  // One-time use: drop it so the same code cannot be replayed.
  //
  // Read, remove, write back is a race: two requests holding the same code both
  // read the full list and both succeed. Writing only if the stored value is
  // still the one that was read (compare-and-swap) lets exactly one win.
  const dropped = await prisma.userTwoFactor.updateMany({
    where: { userId, recoveryCodesEncrypted: record.recoveryCodesEncrypted },
    data: {
      recoveryCodesEncrypted: encrypt(JSON.stringify(codes.filter((c) => c !== normalized))),
    },
  })

  return dropped.count === 1
}

/**
 * Email a time-limited reset link.
 *
 * Returns whether the mail provider accepted the message. The public forgot-
 * password endpoint deliberately ignores this so it cannot reveal accounts;
 * trusted admin invitation flows use it to avoid claiming a failed delivery.
 */
export async function sendPasswordResetLink(
  email: string,
  context: AuditContext,
  portal?: 'customer' | 'provider' | 'admin',
): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { email, ...(portal ? { role: portal } : {}) },
    select: { id: true, role: true },
  })
  if (!user) return false

  const token = randomBytes(32).toString('base64url')

  // One live link at a time: requesting a new one invalidates the old.
  await prisma.passwordResetToken.deleteMany({ where: { email, usedAt: null } })
  await prisma.passwordResetToken.create({
    data: {
      email,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
    },
  })

  const delivered = await sendMail(passwordResetMail(email, token, user.role))

  await recordAudit({
    actorId: user.id,
    action: 'account.password_reset_link_sent',
    subjectType: AuditSubject.user,
    subjectId: user.id,
    metadata: { delivered },
    context,
  })
  return delivered
}

export async function resetPassword(
  input: { token: string; email: string; password: string; portal?: 'customer' | 'provider' | 'admin' },
  context: AuditContext,
): Promise<void> {
  const invalid = new ValidationError({
    email: ['ลิงก์รีเซ็ตไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่'],
  })

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(input.token) },
    select: { id: true, email: true, expiresAt: true, usedAt: true },
  })

  if (
    !record ||
    record.usedAt ||
    record.email !== input.email ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    throw invalid
  }

  const user = await prisma.user.findFirst({
    where: { email: record.email, ...(input.portal ? { role: input.portal } : {}) },
    select: { id: true },
  })
  if (!user) throw invalid

  const passwordHash = await hashPassword(input.password)

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // A reset signs every existing session out.
    prisma.authToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])

  await recordAudit({
    actorId: user.id,
    action: 'account.password_reset_completed',
    subjectType: AuditSubject.user,
    subjectId: user.id,
    context,
  })
}
