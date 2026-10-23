// Unit under test: VoteService (the logic that used to be SQL and `if`s inside the vote route).
// Before the V&V refactoring these cases could only be checked through HTTP + Postgres (see the characterization tests).
import { faker } from '@faker-js/faker';
import { Principal } from '../../src/auth/tokenService';
import { Clock } from '../../src/clock';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/errors';
import { VoteService } from '../../src/services/voteService';
import { aCandidate, aParty } from '../support/builders';
import {
  InMemoryCandidateRepository,
  InMemoryDistrictRepository,
  InMemoryElectionRepository,
  InMemoryPartyRepository,
  InMemoryVoteRepository,
} from '../support/inMemoryRepositories';

const now = new Date('2026-10-04T10:00:00.000Z');
const clock: Clock = { now: () => now };
const voter: Principal = { userId: 7, role: 'VOTER', districtId: 'CM-1' };

async function setUp() {
  const districts = new InMemoryDistrictRepository([
    { id: 'CM-1', province: 'Chiang Mai', number: 1 },
    { id: 'CM-2', province: 'Chiang Mai', number: 2 },
  ]);
  const parties = new InMemoryPartyRepository();
  const candidates = new InMemoryCandidateRepository(parties);
  const votes = new InMemoryVoteRepository(candidates);
  const election = new InMemoryElectionRepository(new Date('2026-10-04T09:00:00.000Z')); // opened an hour ago
  const log = jest.fn();
  const service = new VoteService(votes, candidates, districts, election, clock, log);

  const [blue, red, green] = [
    await parties.create(aParty().build()),
    await parties.create(aParty().build()),
    await parties.create(aParty().build()),
  ];
  const one = await candidates.create(aCandidate().inDistrict('CM-1').forParty(blue.id).numbered(1).build());
  const two = await candidates.create(aCandidate().inDistrict('CM-1').forParty(red.id).numbered(2).build());
  const elsewhere = await candidates.create(aCandidate().inDistrict('CM-2').forParty(green.id).numbered(1).build());

  return { service, districts, votes, election, log, one, two, elsewhere };
}

describe('VoteService.cast', () => {
  describe('happy path', () => {
    it('VT-1: records the first vote and says it was not a change', async () => {
      const { service, votes, one } = await setUp();

      const receipt = await service.cast(voter, one.id);

      expect(receipt).toEqual({ candidateId: one.id, changed: false, votedAt: now });
      expect(votes.voteOf(7)).toBe(one.id);
    });

    it('VT-2: a second vote replaces the first one and says it was a change', async () => {
      const { service, votes, one, two } = await setUp();
      await service.cast(voter, one.id);

      const receipt = await service.cast(voter, two.id);

      expect(receipt).toMatchObject({ candidateId: two.id, changed: true });
      expect(votes.voteOf(7)).toBe(two.id);
    });

    it('VT-3: accepts the candidate id as a string of digits, because JSON clients send both', async () => {
      const { service, one } = await setUp();

      const receipt = await service.cast(voter, String(one.id));

      expect(receipt.candidateId).toBe(one.id);
    });
  });

  describe('who may vote', () => {
    it.each(['COMMISSIONER', 'ADMIN'] as const)('VT-4: a %s cannot vote', async (role) => {
      const { service, votes, one } = await setUp();

      await expect(service.cast({ ...voter, role }, one.id)).rejects.toThrow(new ForbiddenError('only voters can vote'));

      expect(votes.voteOf(7)).toBeUndefined();
    });

    it('VT-5: a voter cannot vote for a candidate of another district', async () => {
      const { service, votes, elsewhere } = await setUp();

      await expect(service.cast(voter, elsewhere.id)).rejects.toThrow('candidate is not in your district');

      expect(votes.voteOf(7)).toBeUndefined();
    });

    it('VT-6: an unknown candidate is "not found"', async () => {
      const { service } = await setUp();

      await expect(service.cast(voter, 999_999)).rejects.toThrow(NotFoundError);
    });
  });

  describe('when voting is not allowed', () => {
    it('VT-7: nobody can vote before the election opens', async () => {
      const { service, election, one } = await setUp();
      election.opensAtValue = new Date('2026-10-04T10:00:00.001Z'); // one millisecond after "now"

      await expect(service.cast(voter, one.id)).rejects.toThrow(new ConflictError('election is not open'));
    });

    it('VT-8: nobody can vote when no election has been set up', async () => {
      const { service, election, one } = await setUp();
      election.opensAtValue = null;

      await expect(service.cast(voter, one.id)).rejects.toThrow('election is not open');
    });

    it('VT-9: nobody can vote or change a vote after the poll of the district is closed, and the old vote stays', async () => {
      const { service, districts, votes, one, two } = await setUp();
      await service.cast(voter, one.id);
      await districts.close('CM-1', new Date('2026-10-04T09:30:00.000Z'));

      await expect(service.cast(voter, two.id)).rejects.toThrow(new ConflictError('poll is closed'));

      expect(votes.voteOf(7)).toBe(one.id);
    });

    it('VT-10: closing one district does not stop the voters of another district', async () => {
      const { service, districts, elsewhere } = await setUp();
      await districts.close('CM-1', new Date('2026-10-04T09:30:00.000Z'));

      const receipt = await service.cast({ ...voter, districtId: 'CM-2' }, elsewhere.id);

      expect(receipt.candidateId).toBe(elsewhere.id);
    });
  });

  describe('validation of candidateId (the V&V fix: bad input is a 400, never a server error)', () => {
    it.each([[undefined], [null], [''], [0]])('VT-11: %p is "required"', async (input) => {
      const { service } = await setUp();

      await expect(service.cast(voter, input)).rejects.toThrow(new ValidationError('candidateId is required'));
    });

    it.each([['abc'], ['1.5'], ['-1'], ['1e3'], [1.5], [-3], [true], [[1]], [{}], [Number.MAX_SAFE_INTEGER + 2]])(
      'VT-12: %j is rejected as "must be a positive integer"',
      async (input) => {
        const { service } = await setUp();

        await expect(service.cast(voter, input)).rejects.toThrow(
          new ValidationError('candidateId must be a positive integer'),
        );
      },
    );

    it('VT-13: a malformed id is rejected before any repository is asked', async () => {
      const { service, election } = await setUp();
      const opensAt = jest.spyOn(election, 'opensAt');

      await expect(service.cast(voter, 'abc')).rejects.toThrow(ValidationError);

      expect(opensAt).not.toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('VT-14: logs one line for a new vote and one for a changed vote', async () => {
      const { service, log, one, two } = await setUp();

      await service.cast(voter, one.id);
      await service.cast(voter, two.id);

      expect(log.mock.calls.map(([line]) => line)).toEqual([
        `[vote] voter 7 voted for ${one.id} at 2026-10-04T10:00:00.000Z`,
        `[vote] voter 7 changed vote to ${two.id} at 2026-10-04T10:00:00.000Z`,
      ]);
    });

    it('VT-14b: writes to console.log when no logger is given (the behaviour of the original route)', async () => {
      const { votes, one } = await setUp();
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
      const parties = new InMemoryPartyRepository();
      const candidates = new InMemoryCandidateRepository(parties);
      const districts = new InMemoryDistrictRepository([{ id: 'CM-1', province: 'Chiang Mai', number: 1 }]);
      const election = new InMemoryElectionRepository(new Date('2026-10-04T09:00:00.000Z'));
      const withDefaultLogger = new VoteService(votes, candidates, districts, election, clock);
      candidates.candidates.push({ ...one }); // the candidate that VoteService looks up

      await withDefaultLogger.cast(voter, one.id);

      expect(consoleLog).toHaveBeenCalledWith(`[vote] voter 7 voted for ${one.id} at 2026-10-04T10:00:00.000Z`);
      consoleLog.mockRestore();
    });

    it('VT-15: logs nothing when the vote is refused', async () => {
      const { service, log } = await setUp();

      await expect(service.cast(voter, 999_999)).rejects.toThrow();

      expect(log).not.toHaveBeenCalled();
    });
  });

  describe('generated data (Faker)', () => {
    it.each([1, 2, 3, 4, 5])('VT-16: any voter of the district can vote for any candidate of it (seed %i)', async (seed) => {
      faker.seed(seed);
      const { service, votes, one, two } = await setUp();
      const randomVoter: Principal = { userId: faker.number.int({ min: 1, max: 1_000_000 }), role: 'VOTER', districtId: 'CM-1' };
      const chosen = faker.helpers.arrayElement([one, two]);

      const receipt = await service.cast(randomVoter, chosen.id);

      expect(receipt).toMatchObject({ candidateId: chosen.id, changed: false });
      expect(votes.voteOf(randomVoter.userId)).toBe(chosen.id);
    });
  });
});

describe('VoteService.choices', () => {
  it('VT-17: lists the candidates of the voter district in number order and marks the chosen one', async () => {
    const { service, one, two } = await setUp();
    await service.cast(voter, two.id);

    const choices = await service.choices(voter);

    expect(choices.map((c) => [c.id, c.number, c.selected])).toEqual([
      [one.id, 1, false],
      [two.id, 2, true],
    ]);
  });

  it('VT-18: does not show the candidates of other districts', async () => {
    const { service, elsewhere } = await setUp();

    const choices = await service.choices(voter);

    expect(choices.map((c) => c.id)).not.toContain(elsewhere.id);
  });
});
