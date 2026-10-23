// Unit under test: AccountService.login  (feature: "a voter logs in and receives a token")
//   2.3.1 happy path   UT-B1
//   2.3.2 failure path UT-B3, UT-B4
//   2.3.5 mock         UT-B2
import { hashPassword } from '../../../src/auth/passwords';
import { Principal, TokenService } from '../../../src/auth/tokenService';
import { User } from '../../../src/domain/types';
import { UnauthorizedError } from '../../../src/errors';
import { DistrictRepository } from '../../../src/repositories/districtRepository';
import { AccountService } from '../../../src/services/accountService';
import { aVoter } from '../../support/builders';
import { InMemoryUserRepository } from '../../support/inMemoryRepositories';

const unusedDistricts: DistrictRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  closedAt: jest.fn(),
  close: jest.fn(),
};

/** A voter that is already stored, with a real password hash. */
async function storedVoter(users: InMemoryUserRepository, password: string): Promise<User> {
  const data = aVoter().inDistrict('CM-2').withPassword(password).build();
  return users.create({
    nationalId: data.nationalId,
    passwordHash: hashPassword(password),
    firstName: data.firstName,
    lastName: data.lastName,
    address: data.address,
    districtId: data.districtId,
  });
}

describe('AccountService.login', () => {
  describe('2.3.1 happy path', () => {
    it('UT-B1: returns the token that the token service created', async () => {
      const users = new InMemoryUserRepository();
      const voter = await storedVoter(users, 'correct-horse');
      const tokens: TokenService = { issue: () => 'token-123', verify: () => null };
      const service = new AccountService(users, unusedDistricts, tokens);

      const token = await service.login(voter.nationalId, 'correct-horse');

      expect(token).toBe('token-123');
    });
  });

  describe('2.3.5 mock', () => {
    it('UT-B2: asks the token service exactly once, for the principal of this voter', async () => {
      const users = new InMemoryUserRepository();
      const voter = await storedVoter(users, 'correct-horse');
      // MOCK: it carries the expectation. The test fails if the interaction is not exactly this one.
      const issue = jest.fn<string, [Principal]>().mockReturnValue('signed');
      const service = new AccountService(users, unusedDistricts, { issue, verify: jest.fn() });

      await service.login(voter.nationalId, 'correct-horse');

      expect(issue).toHaveBeenCalledTimes(1);
      expect(issue).toHaveBeenCalledWith({ userId: voter.id, role: 'VOTER', districtId: 'CM-2' });
    });
  });

  describe('2.3.2 alternative / failure path', () => {
    it('UT-B3: rejects a wrong password and never asks for a token', async () => {
      const users = new InMemoryUserRepository();
      const voter = await storedVoter(users, 'correct-horse');
      const issue = jest.fn();
      const service = new AccountService(users, unusedDistricts, { issue, verify: jest.fn() });

      await expect(service.login(voter.nationalId, 'wrong-horse')).rejects.toThrow(UnauthorizedError);

      expect(issue).not.toHaveBeenCalled();
    });

    it('UT-B4: gives the same message for an unknown id as for a wrong password', async () => {
      const users = new InMemoryUserRepository();
      const voter = await storedVoter(users, 'correct-horse');
      const service = new AccountService(users, unusedDistricts, { issue: jest.fn(), verify: jest.fn() });

      const unknownId = service.login('1100000000016', 'whatever');
      const wrongPassword = service.login(voter.nationalId, 'wrong-horse');

      await expect(unknownId).rejects.toThrow('invalid national id or password');
      await expect(wrongPassword).rejects.toThrow('invalid national id or password');
    });
  });
});
