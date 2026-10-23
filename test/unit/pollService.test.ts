import { Clock } from '../../src/clock';
import { ConflictError, NotFoundError } from '../../src/errors';
import { PollService } from '../../src/services/pollService';
import {
  InMemoryCandidateRepository,
  InMemoryDistrictRepository,
  InMemoryPartyRepository,
  InMemoryVoteRepository,
} from '../support/inMemoryRepositories';

// Inner loop of outside-in development: I wrote this test BEFORE the service, and the test told me what the
// service needs from the outside world:
//   - a Clock                   (closedAt must come from the clock, so the test can use a fixed one)
//   - a way to mark a district as closed (DistrictRepository.close / closedAt)
//   - something that counts votes per candidate (the new VoteRepository)
const closingTime = new Date('2026-10-04T12:00:00.000Z');
const fixedClock: Clock = { now: () => closingTime };

async function setUp() {
  const districts = new InMemoryDistrictRepository([
    { id: 'CM-3', province: 'Chiang Mai', number: 3 },
    { id: 'CM-2', province: 'Chiang Mai', number: 2 },
  ]);
  const parties = new InMemoryPartyRepository();
  const candidates = new InMemoryCandidateRepository(parties);
  const votes = new InMemoryVoteRepository(candidates);
  const service = new PollService(districts, candidates, votes, fixedClock);

  const blue = await parties.create({ name: 'Blue', logoUrl: null, policy: 'x' });
  const red = await parties.create({ name: 'Red', logoUrl: null, policy: 'y' });
  const green = await parties.create({ name: 'Green', logoUrl: null, policy: 'z' });
  const base = { districtId: 'CM-3', photoUrl: null, lastName: 'Test' };
  const one = await candidates.create({ ...base, partyId: blue.id, number: 1, firstName: 'One' });
  const two = await candidates.create({ ...base, partyId: red.id, number: 2, firstName: 'Two' });
  await candidates.create({ ...base, partyId: green.id, number: 3, firstName: 'Three' });

  return { service, districts, votes, one, two };
}

describe('PollService.close', () => {
  it('closes the district at the time given by the clock', async () => {
    const { service, districts } = await setUp();

    const result = await service.close('CM-3');

    expect(result).toEqual({ districtId: 'CM-3', closedAt: closingTime });
    expect(await districts.closedAt('CM-3')).toEqual(closingTime);
  });

  it('does not close any other district', async () => {
    const { service, districts } = await setUp();

    await service.close('CM-3');

    expect(await districts.closedAt('CM-2')).toBeNull();
  });

  it('rejects a district that is already closed', async () => {
    const { service } = await setUp();
    await service.close('CM-3');

    await expect(service.close('CM-3')).rejects.toThrow(ConflictError);
  });

  it('rejects a district that does not exist, and does not try to close it', async () => {
    const { service, districts } = await setUp();
    const closeSpy = jest.spyOn(districts, 'close'); // spy: the real fake runs, and I only watch the calls

    await expect(service.close('ZZ-99')).rejects.toThrow(NotFoundError);

    expect(closeSpy).not.toHaveBeenCalled();
  });
});

describe('PollService.resultsFor', () => {
  it('hides the scores while the poll is open', async () => {
    const { service, votes, one } = await setUp();
    votes.cast(1, one.id);

    const results = await service.resultsFor('CM-3');

    expect(results.closed).toBe(false);
    expect(results).not.toHaveProperty('closedAt');
    expect(results.candidates.map((c) => 'votes' in c)).toEqual([false, false, false]);
  });

  it('does not even read the votes while the poll is open', async () => {
    const { service, votes } = await setUp();
    const countSpy = jest.spyOn(votes, 'countByCandidate');

    await service.resultsFor('CM-3');

    expect(countSpy).not.toHaveBeenCalled();
  });

  it('shows the votes of every candidate once the poll is closed, in candidate-number order', async () => {
    const { service, votes, one, two } = await setUp();
    votes.cast(1, one.id);
    votes.cast(2, one.id);
    votes.cast(3, two.id);
    await service.close('CM-3');

    const results = await service.resultsFor('CM-3');

    expect(results).toMatchObject({ closed: true, closedAt: closingTime });
    expect(results.candidates.map((c) => [c.number, c.votes])).toEqual([
      [1, 2],
      [2, 1],
      [3, 0],
    ]);
  });

  it('answers with the district and the candidate details', async () => {
    const { service } = await setUp();

    const results = await service.resultsFor('CM-3');

    expect(results.district).toEqual({ id: 'CM-3', province: 'Chiang Mai', number: 3 });
    expect(results.candidates[0]).toMatchObject({ number: 1, firstName: 'One', partyName: 'Blue' });
  });

  it('rejects a district that does not exist', async () => {
    const { service } = await setUp();

    await expect(service.resultsFor('ZZ-99')).rejects.toThrow(NotFoundError);
  });
});
