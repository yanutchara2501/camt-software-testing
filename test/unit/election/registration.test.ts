// Unit under test: AccountService.register  (feature: "a citizen registers as a voter")
// Cases are named UT-A1 ... UT-A7, as in docs/election-app/unit-test-design.md.
//
// Assignment items covered in this file:
//   2.3.1 happy path        UT-A1
//   2.3.2 failure path      UT-A2, UT-A3
//   2.3.3 stub              UT-A4
//   2.3.4 spy               UT-A5
//   2.3.6 faker data        UT-A7
import { faker, fakerTH } from '@faker-js/faker';
import { verifyPassword } from '../../../src/auth/passwords';
import { TokenService } from '../../../src/auth/tokenService';
import { District, User } from '../../../src/domain/types';
import { ConflictError, ValidationError } from '../../../src/errors';
import { DistrictRepository } from '../../../src/repositories/districtRepository';
import { UserRepository } from '../../../src/repositories/userRepository';
import { AccountService, Registration } from '../../../src/services/accountService';
import { aVoter } from '../../support/builders';
import { InMemoryUserRepository } from '../../support/inMemoryRepositories';
import { aValidNationalId, anInvalidNationalId } from '../../support/nationalIds';

const cm1: District = { id: 'CM-1', province: 'Chiang Mai', number: 1 };

// Register never touches the token service, so a dummy that explodes when used is enough.
const unusedTokens: TokenService = {
  issue: () => {
    throw new Error('register must not issue a token');
  },
  verify: () => {
    throw new Error('register must not verify a token');
  },
};

/** STUB of DistrictRepository: it only answers "CM-1 exists" and nothing else. */
const districtsWithCm1: DistrictRepository = {
  findAll: async () => [cm1],
  findById: async (id) => (id === 'CM-1' ? cm1 : null),
  closedAt: async () => null,
  close: async () => false,
};

const validRegistration = (): Registration => ({
  nationalId: '1509900000017',
  password: 'voter1234',
  firstName: 'Somchai',
  lastName: 'Jaidee',
  address: '239 Huay Kaew Rd',
  districtId: 'CM-1',
});

describe('AccountService.register', () => {
  describe('2.3.1 happy path', () => {
    it('UT-A1: registers a citizen of an existing district as a VOTER and trims the text fields', async () => {
      const users = new InMemoryUserRepository();
      const service = new AccountService(users, districtsWithCm1, unusedTokens);

      const result = await service.register({
        ...validRegistration(),
        firstName: '  Somchai ',
        address: ' 239 Huay Kaew Rd ',
      });

      expect(result).toEqual({
        id: expect.any(Number),
        nationalId: '1509900000017',
        firstName: 'Somchai',
        lastName: 'Jaidee',
        address: '239 Huay Kaew Rd',
        districtId: 'CM-1',
        role: 'VOTER',
      });
    });
  });

  describe('2.3.2 alternative / failure path', () => {
    it('UT-A2: rejects a national id with a wrong checksum and saves nothing', async () => {
      const users = new InMemoryUserRepository();
      const service = new AccountService(users, districtsWithCm1, unusedTokens);

      const registration = { ...validRegistration(), nationalId: '1509900000018' };

      await expect(service.register(registration)).rejects.toThrow(new ValidationError('invalid national id'));
      expect(users.users).toHaveLength(0);
    });

    // Boundary value analysis for "password has at least 8 characters": test 7 (just below) and 8 (on the border).
    it('UT-A3a: rejects a password of 7 characters (just below the border)', async () => {
      const service = new AccountService(new InMemoryUserRepository(), districtsWithCm1, unusedTokens);

      const outcome = service.register({ ...validRegistration(), password: 'p'.repeat(7) });

      await expect(outcome).rejects.toThrow('password must be at least 8 characters');
    });

    it('UT-A3b: accepts a password of exactly 8 characters (on the border)', async () => {
      const service = new AccountService(new InMemoryUserRepository(), districtsWithCm1, unusedTokens);

      const outcome = service.register({ ...validRegistration(), password: 'p'.repeat(8) });

      await expect(outcome).resolves.toMatchObject({ role: 'VOTER' });
    });
  });

  describe('2.3.3 stub', () => {
    it('UT-A4: rejects a national id that is already registered (stubbed lookup returns an existing user)', async () => {
      const existing: User = { ...validRegistration(), id: 99, passwordHash: 'x', role: 'VOTER' };
      // STUB: findByNationalId always answers with `existing`. The test controls what the service *gets*.
      const usersStub: UserRepository = {
        findById: jest.fn(),
        findByNationalId: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        updateRole: jest.fn(),
      };
      const service = new AccountService(usersStub, districtsWithCm1, unusedTokens);

      await expect(service.register(validRegistration())).rejects.toThrow(ConflictError);
    });
  });

  describe('2.3.4 spy', () => {
    it('UT-A5: hands the repository the trimmed data and a password HASH (spy on the real fake)', async () => {
      const users = new InMemoryUserRepository();
      // SPY: the fake still does its real work, jest only records every call.
      const createSpy = jest.spyOn(users, 'create');
      const service = new AccountService(users, districtsWithCm1, unusedTokens);

      await service.register({ ...validRegistration(), lastName: ' Jaidee ' });

      expect(createSpy).toHaveBeenCalledTimes(1);
      const saved = createSpy.mock.calls[0][0];
      expect(saved).toMatchObject({ nationalId: '1509900000017', lastName: 'Jaidee', districtId: 'CM-1' });
      expect(saved.passwordHash).not.toContain('voter1234');
      expect(verifyPassword('voter1234', saved.passwordHash)).toBe(true);
    });
  });

  describe('2.3.6 data generated by Faker', () => {
    // Different generated data each time (the seed is fixed per test, so a red run can be repeated).
    function generatedRegistration(): Registration {
      return {
        nationalId: aValidNationalId(),
        password: faker.internet.password({ length: faker.number.int({ min: 8, max: 30 }) }),
        firstName: fakerTH.person.firstName(),
        lastName: fakerTH.person.lastName(),
        address: fakerTH.location.streetAddress(),
        districtId: 'CM-1',
      };
    }

    it.each([1, 2, 3, 4, 5, 6, 7, 8])(
      'UT-A7: any well-formed random citizen can register (faker seed %i)',
      async (seed) => {
        faker.seed(seed);
        fakerTH.seed(seed);
        const registration = generatedRegistration();
        const users = new InMemoryUserRepository();
        const service = new AccountService(users, districtsWithCm1, unusedTokens);

        const result = await service.register(registration);

        expect(result).toMatchObject({ nationalId: registration.nationalId, districtId: 'CM-1', role: 'VOTER' });
        expect(result).not.toHaveProperty('passwordHash');
        expect(verifyPassword(registration.password, users.users[0].passwordHash)).toBe(true);
      },
    );

    it('UT-A8: any random citizen with a broken national id is rejected and nothing is saved', async () => {
      const users = new InMemoryUserRepository();
      const service = new AccountService(users, districtsWithCm1, unusedTokens);
      const registration = { ...aVoter().inDistrict('CM-1').buildRegistration(), nationalId: anInvalidNationalId() };

      await expect(service.register(registration)).rejects.toThrow('invalid national id');
      expect(users.users).toHaveLength(0);
    });
  });
});
