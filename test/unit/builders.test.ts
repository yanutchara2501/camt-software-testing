import { faker } from '@faker-js/faker';
import { isValidThaiNationalId } from '../../src/domain/thaiNationalId';
import { aCandidate, aCommissioner, aParty, aVoter } from '../support/builders';
import { aValidNationalId, anInvalidNationalId } from '../support/nationalIds';
import { seedFaker } from '../support/seedFaker';

// The test data helpers are code too. If a builder produced an invalid national id, every test that uses it
// would fail for the wrong reason, so the builders get their own small tests.
describe('test data helpers', () => {
  describe('aValidNationalId', () => {
    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('produces an id with a correct checksum for faker seed %i', (seed) => {
      faker.seed(seed);

      const id = aValidNationalId();

      expect(isValidThaiNationalId(id)).toBe(true);
    });
  });

  describe('anInvalidNationalId', () => {
    it.each([1, 2, 3, 4, 5])('produces an id the validator rejects for faker seed %i', (seed) => {
      faker.seed(seed);

      const id = anInvalidNationalId();

      expect(isValidThaiNationalId(id)).toBe(false);
    });
  });

  describe('builders', () => {
    it('lets a test override only what matters and keeps the rest valid', () => {
      const voter = aVoter().inDistrict('CM-2').build();

      expect(voter).toMatchObject({ districtId: 'CM-2', role: 'VOTER' });
      expect(isValidThaiNationalId(voter.nationalId)).toBe(true);
      expect(voter.password.length).toBeGreaterThanOrEqual(8);
    });

    it('does not change the builder it was called on (immutable)', () => {
      const base = aVoter();

      base.inDistrict('CM-9');

      expect(base.build().districtId).toBe('CM-1');
    });

    it('builds a commissioner with the COMMISSIONER role', () => {
      expect(aCommissioner().build().role).toBe('COMMISSIONER');
    });

    it('builds registrations without a role', () => {
      const registration = aVoter().buildRegistration();

      expect(registration).not.toHaveProperty('role');
    });

    it('gives two parties different names', () => {
      const first = aParty().build();
      const second = aParty().build();

      expect(first.name).not.toBe(second.name);
    });

    it('builds a candidate from the pieces that the test names', () => {
      const candidate = aCandidate().inDistrict('CM-3').forParty(7).numbered(4).build();

      expect(candidate).toMatchObject({ districtId: 'CM-3', partyId: 7, number: 4 });
    });
  });

  describe('seedFaker', () => {
    it('makes the generated data repeatable', () => {
      seedFaker(42);
      const first = aVoter().build();
      seedFaker(42);
      const second = aVoter().build();

      expect(second).toEqual(first);
    });
  });
});
