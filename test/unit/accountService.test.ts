import { hashPassword, verifyPassword } from '../../src/auth/passwords';
import { Principal, TokenService } from '../../src/auth/tokenService';
import { User } from '../../src/domain/types';
import { ConflictError, UnauthorizedError, ValidationError } from '../../src/errors';
import { DistrictRepository } from '../../src/repositories/districtRepository';
import { NewUser } from '../../src/repositories/userRepository';
import { AccountService, Registration } from '../../src/services/accountService';
import { InMemoryUserRepository } from '../support/inMemoryRepositories';

const cm1 = { id: 'CM-1', province: 'Chiang Mai', number: 1 };

const registration: Registration = {
  nationalId: '1509900000017',
  password: 'voter1234',
  firstName: 'Somchai',
  lastName: 'Jaidee',
  address: '1 Nimman Rd',
  districtId: 'CM-1',
};

// DUMMY: must be passed in, but the test is not supposed to use it.
// It throws if someone calls it, so an accidental use turns the test red.
const dummyTokens: TokenService = {
  issue: () => {
    throw new Error('dummy token service must not be used');
  },
  verify: () => {
    throw new Error('dummy token service must not be used');
  },
};

// STUB: gives a canned answer. The test only controls the *input* that the service receives.
function stubDistricts(known: boolean): DistrictRepository {
  return {
    findAll: jest.fn(),
    findById: jest.fn().mockResolvedValue(known ? cm1 : null),
    closedAt: jest.fn(),
    close: jest.fn(),
  };
}

// A user repository made of jest.fn(). Each test decides if it plays a stub, a spy or a mock.
function userRepoDoubles() {
  return {
    findById: jest.fn<Promise<User | null>, [number]>(),
    findByNationalId: jest.fn<Promise<User | null>, [string]>().mockResolvedValue(null),
    create: jest.fn(async (u: NewUser): Promise<User> => ({ ...u, id: 1, role: 'VOTER' })),
    updateRole: jest.fn<Promise<User | null>, [number, string]>(),
  };
}

describe('AccountService', () => {
  describe('register', () => {
    it('registers a voter in an existing district', async () => {
      const users = new InMemoryUserRepository(); // FAKE: a working repository without a database
      const service = new AccountService(users, stubDistricts(true), dummyTokens);

      const result = await service.register(registration);

      expect(result).toMatchObject({ nationalId: '1509900000017', districtId: 'CM-1', role: 'VOTER' });
      expect(users.users).toHaveLength(1);
    });

    it('rejects an unknown district', async () => {
      const service = new AccountService(userRepoDoubles(), stubDistricts(false), dummyTokens);

      const promise = service.register(registration);

      await expect(promise).rejects.toThrow(ValidationError);
      await expect(promise).rejects.toThrow('unknown district');
    });

    it('stores a hash and never the plain-text password', async () => {
      const users = userRepoDoubles();
      const service = new AccountService(users, stubDistricts(true), dummyTokens);

      await service.register(registration);

      // SPY: the double recorded what was sent to it, and now I look at the recording.
      const saved = users.create.mock.calls[0][0];
      expect(saved.passwordHash).not.toBe('voter1234');
      expect(verifyPassword('voter1234', saved.passwordHash)).toBe(true);
    });

    it('does not return the password hash to the caller', async () => {
      const service = new AccountService(userRepoDoubles(), stubDistricts(true), dummyTokens);

      const result = await service.register(registration);

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('rejects a national id that is already registered', async () => {
      const users = new InMemoryUserRepository();
      const service = new AccountService(users, stubDistricts(true), dummyTokens);
      await service.register(registration); // the first one is accepted

      const second = service.register({ ...registration, firstName: 'Somying' });

      await expect(second).rejects.toThrow(ConflictError);
      expect(users.users).toHaveLength(1);
    });

    it('does not save anything when the national id is invalid', async () => {
      const users = userRepoDoubles();
      const service = new AccountService(users, stubDistricts(true), dummyTokens);

      await expect(service.register({ ...registration, nationalId: '1509900000018' })).rejects.toThrow(ValidationError);

      // MOCK style check: I expected that "create" is never called, and the double verifies that expectation.
      expect(users.create).not.toHaveBeenCalled();
    });

    it.each([
      ['a password shorter than 8 characters', { password: 'short' }],
      ['an empty first name', { firstName: '   ' }],
      ['an empty address', { address: '' }],
    ])('rejects %s', async (_label, change) => {
      const service = new AccountService(userRepoDoubles(), stubDistricts(true), dummyTokens);

      await expect(service.register({ ...registration, ...change })).rejects.toThrow(ValidationError);
    });
  });

  describe('login', () => {
    const storedUser: User = {
      id: 42,
      nationalId: '1509900000017',
      passwordHash: hashPassword('voter1234'),
      firstName: 'Somchai',
      lastName: 'Jaidee',
      address: '1 Nimman Rd',
      districtId: 'CM-1',
      role: 'VOTER',
    };

    it('issues a token for the user', async () => {
      const users = userRepoDoubles();
      users.findByNationalId.mockResolvedValue(storedUser); // stub: the user that "exists"
      const issue = jest.fn().mockReturnValue('signed-token');
      const service = new AccountService(users, stubDistricts(true), { issue, verify: jest.fn() });

      const token = await service.login('1509900000017', 'voter1234');

      expect(token).toBe('signed-token');
      // MOCK: the token service must be called with exactly this principal
      const expected: Principal = { userId: 42, role: 'VOTER', districtId: 'CM-1' };
      expect(issue).toHaveBeenCalledWith(expected);
    });

    it('rejects a wrong password without issuing a token', async () => {
      const users = userRepoDoubles();
      users.findByNationalId.mockResolvedValue(storedUser);
      const issue = jest.fn();
      const service = new AccountService(users, stubDistricts(true), { issue, verify: jest.fn() });

      await expect(service.login('1509900000017', 'wrong-password')).rejects.toThrow(UnauthorizedError);

      expect(issue).not.toHaveBeenCalled();
    });

    it('gives the same error for an unknown user, so nobody can find out which ids exist', async () => {
      const service = new AccountService(userRepoDoubles(), stubDistricts(true), dummyTokens);

      await expect(service.login('1100000000016', 'voter1234')).rejects.toThrow('invalid national id or password');
    });
  });

  describe('changeRole', () => {
    it('refuses to make anyone an ADMIN', async () => {
      const users = userRepoDoubles();
      const service = new AccountService(users, stubDistricts(true), dummyTokens);

      await expect(service.changeRole(1, 'ADMIN')).rejects.toThrow(ValidationError);

      expect(users.updateRole).not.toHaveBeenCalled();
    });

    it('reports "not found" when the user does not exist', async () => {
      const users = userRepoDoubles();
      users.updateRole.mockResolvedValue(null);
      const service = new AccountService(users, stubDistricts(true), dummyTokens);

      await expect(service.changeRole(999, 'COMMISSIONER')).rejects.toThrow('user not found');
    });
  });
});
