import { hashPassword, verifyPassword } from '../../src/auth/passwords';

describe('hashPassword', () => {
  it('does not return the plain-text password', () => {
    const password = 'voter1234';

    const stored = hashPassword(password);

    expect(stored).not.toContain(password);
  });

  it('uses the scrypt$salt$hash format', () => {
    const stored = hashPassword('voter1234');

    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  it('gives a different result every time for the same password (random salt)', () => {
    const first = hashPassword('voter1234');
    const second = hashPassword('voter1234');

    expect(first).not.toBe(second);
  });
});

describe('verifyPassword', () => {
  const stored = hashPassword('voter1234');

  it('accepts the password that was hashed', () => {
    expect(verifyPassword('voter1234', stored)).toBe(true);
  });

  it('rejects a different password', () => {
    expect(verifyPassword('voter12345', stored)).toBe(false);
  });

  it.each([
    ['garbage text', 'garbage'],
    ['an unknown scheme', 'bcrypt$salt$hash'],
    ['a missing hash part', 'scrypt$onlysalt'],
    ['an empty string', ''],
  ])('returns false (does not throw) for %s as the stored hash', (_label, badStored) => {
    expect(verifyPassword('voter1234', badStored)).toBe(false);
  });
});
