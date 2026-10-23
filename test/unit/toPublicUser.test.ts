import { User } from '../../src/domain/types';
import { toPublicUser } from '../../src/services/accountService';

describe('toPublicUser', () => {
  const user: User = {
    id: 7,
    nationalId: '1509900000017',
    passwordHash: 'scrypt$salt$hash',
    firstName: 'Somchai',
    lastName: 'Jaidee',
    address: '1 Nimman Rd',
    districtId: 'CM-1',
    role: 'VOTER',
  };

  it('removes the password hash', () => {
    const publicUser = toPublicUser(user);

    expect(publicUser).not.toHaveProperty('passwordHash');
  });

  it('keeps every other field', () => {
    const { passwordHash: _removed, ...everythingElse } = user;

    const publicUser = toPublicUser(user);

    expect(publicUser).toEqual(everythingElse);
  });
});
