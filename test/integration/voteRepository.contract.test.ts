import { Pool } from 'pg';
import { PgVoteRepository, VoteRepository } from '../../src/repositories/voteRepository';
import { aCandidate, aParty, aVoter } from '../support/builders';
import {
  InMemoryCandidateRepository,
  InMemoryPartyRepository,
  InMemoryVoteRepository,
} from '../support/inMemoryRepositories';
import { createTestPool, truncateAll } from './support/database';
import { givenFor } from './support/given';
import { JwtTokenService } from '../../src/auth/tokenService';

// Contract: castVote / choicesFor behave the same on the fake (used by the VoteService unit tests) and on Postgres.
// Each runner prepares two candidates in CM-1 and two voters, and hands over their ids.
interface World {
  repo: VoteRepository;
  candidates: [number, number];
  voters: [number, number];
}

function voteRepositoryContract(name: string, prepare: () => Promise<World>) {
  describe(`VoteRepository contract: ${name}`, () => {
    const at = new Date('2026-10-04T10:00:00.000Z');
    let world: World;

    beforeEach(async () => {
      world = await prepare();
    });

    it('says "not changed" for the first vote of a voter', async () => {
      const result = await world.repo.castVote(world.voters[0], world.candidates[0], at);

      expect(result).toEqual({ changed: false });
    });

    it('says "changed" when the same voter votes again, and the second vote wins', async () => {
      await world.repo.castVote(world.voters[0], world.candidates[0], at);

      const result = await world.repo.castVote(world.voters[0], world.candidates[1], at);
      const tally = await world.repo.countByCandidate('CM-1');

      expect(result).toEqual({ changed: true });
      expect([...tally]).toEqual([[world.candidates[1], 1]]);
    });

    it('counts the votes of different voters separately', async () => {
      await world.repo.castVote(world.voters[0], world.candidates[0], at);
      await world.repo.castVote(world.voters[1], world.candidates[0], at);

      const tally = await world.repo.countByCandidate('CM-1');

      expect(tally.get(world.candidates[0])).toBe(2);
      expect(tally.has(world.candidates[1])).toBe(false);
    });

    it('lists the ballot in number order and marks only the choice of the asked voter', async () => {
      await world.repo.castVote(world.voters[0], world.candidates[1], at);

      const mine = await world.repo.choicesFor('CM-1', world.voters[0]);
      const other = await world.repo.choicesFor('CM-1', world.voters[1]);

      expect(mine.map((c) => [c.number, c.selected])).toEqual([
        [1, false],
        [2, true],
      ]);
      expect(other.map((c) => c.selected)).toEqual([false, false]);
    });
  });
}

voteRepositoryContract('in-memory fake', async () => {
  const parties = new InMemoryPartyRepository();
  const candidates = new InMemoryCandidateRepository(parties);
  const first = await candidates.create(
    aCandidate()
      .inDistrict('CM-1')
      .forParty((await parties.create(aParty().build())).id)
      .numbered(1)
      .build(),
  );
  const second = await candidates.create(
    aCandidate()
      .inDistrict('CM-1')
      .forParty((await parties.create(aParty().build())).id)
      .numbered(2)
      .build(),
  );
  return { repo: new InMemoryVoteRepository(candidates), candidates: [first.id, second.id], voters: [1, 2] };
});

describe('with the real database', () => {
  const pool: Pool = createTestPool();
  const tokens = new JwtTokenService('test-secret');
  const given = givenFor(pool, tokens);

  afterAll(async () => {
    await pool.end();
  });

  async function prepareWorld(): Promise<World> {
    await truncateAll(pool);
    const first = await given.candidate(
      aCandidate()
        .inDistrict('CM-1')
        .forParty((await given.party()).id)
        .numbered(1),
    );
    const second = await given.candidate(
      aCandidate()
        .inDistrict('CM-1')
        .forParty((await given.party()).id)
        .numbered(2),
    );
    const voters = [await given.user(aVoter().inDistrict('CM-1')), await given.user(aVoter().inDistrict('CM-1'))];
    return {
      repo: new PgVoteRepository(pool),
      candidates: [first.id, second.id],
      voters: [voters[0].user.id, voters[1].user.id],
    };
  }

  voteRepositoryContract('Postgres', prepareWorld);

  // The defect that the old SELECT-then-INSERT code had: two requests of the same voter at the same moment.
  it('survives many simultaneous first votes of the same voter and keeps exactly one vote', async () => {
    const world = await prepareWorld();
    const at = new Date('2026-10-04T10:00:00.000Z');
    // open several connections first, so the requests really run side by side
    await Promise.all(Array.from({ length: 10 }, () => pool.query('SELECT 1')));

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => world.repo.castVote(world.voters[0], world.candidates[i % 2], at)),
    );
    const rows = await pool.query('SELECT candidate_id FROM votes WHERE voter_id = $1', [world.voters[0]]);

    expect(results.filter((r) => r.changed === false)).toHaveLength(1); // exactly one of them was the first vote
    expect(rows.rows).toHaveLength(1); // and the voter still has exactly one vote
  });
});
