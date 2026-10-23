// Unit under test: PollService  (feature: "a commissioner closes a district's poll, then the score is public")
// The poll of a district is a tiny state machine:  OPEN --close--> CLOSED   (CLOSED --close--> error)
//   2.3.1 happy path    UT-C1
//   2.3.2 failure path  UT-C2
//   2.3.3 stub          UT-C3 (stubbed clock)
//   2.3.5 mock          UT-C4 (mocked DistrictRepository.close)
import { faker } from '@faker-js/faker';
import { Clock } from '../../../src/clock';
import { ConflictError } from '../../../src/errors';
import { PollService } from '../../../src/services/pollService';
import { aCandidate, aParty } from '../../support/builders';
import {
  InMemoryCandidateRepository,
  InMemoryDistrictRepository,
  InMemoryPartyRepository,
  InMemoryVoteRepository,
} from '../../support/inMemoryRepositories';

function setUp(clock: Clock = { now: () => new Date('2026-10-04T12:00:00.000Z') }) {
  const districts = new InMemoryDistrictRepository([{ id: 'CM-1', province: 'Chiang Mai', number: 1 }]);
  const parties = new InMemoryPartyRepository();
  const candidates = new InMemoryCandidateRepository(parties);
  const votes = new InMemoryVoteRepository(candidates);
  return { districts, parties, candidates, votes, service: new PollService(districts, candidates, votes, clock) };
}

describe('PollService', () => {
  describe('2.3.1 happy path', () => {
    it('UT-C1: after closing, the results show the vote count of each candidate', async () => {
      const { service, parties, candidates, votes } = setUp();
      const party = await parties.create(aParty().build());
      const candidate = await candidates.create(aCandidate().inDistrict('CM-1').forParty(party.id).numbered(1).build());
      const howManyVoted = faker.number.int({ min: 1, max: 20 }); // generated: the test must hold for any count
      Array.from({ length: howManyVoted }, (_, voterId) => votes.cast(voterId + 1, candidate.id));

      await service.close('CM-1');
      const results = await service.resultsFor('CM-1');

      expect(results.candidates).toEqual([expect.objectContaining({ number: 1, votes: howManyVoted })]);
    });
  });

  describe('2.3.2 alternative / failure path', () => {
    it('UT-C2: closing a poll twice is a conflict and keeps the first closing time', async () => {
      const { service, districts } = setUp();
      await service.close('CM-1');

      await expect(service.close('CM-1')).rejects.toThrow(ConflictError);

      expect(await districts.closedAt('CM-1')).toEqual(new Date('2026-10-04T12:00:00.000Z'));
    });
  });

  describe('2.3.3 stub', () => {
    it('UT-C3: the closing time is whatever the stubbed clock says', async () => {
      const stubbedClock: Clock = { now: () => new Date('2030-02-03T04:05:06.000Z') }; // STUB: canned time
      const { service } = setUp(stubbedClock);

      const closed = await service.close('CM-1');

      expect(closed.closedAt).toEqual(new Date('2030-02-03T04:05:06.000Z'));
    });
  });

  describe('2.3.5 mock', () => {
    it('UT-C4: asks the district repository once to close, with the district id and the time of the clock', async () => {
      const { service, districts } = setUp();
      // MOCK: replace the method and set the expectation about how it must be called.
      const close = jest.fn().mockResolvedValue(true);
      districts.close = close;

      await service.close('CM-1');

      expect(close).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledWith('CM-1', new Date('2026-10-04T12:00:00.000Z'));
    });
  });
});
