import request from 'supertest';
import { Pool } from 'pg';
import { createApp, pgDeps } from '../../src/app';
import { JwtTokenService } from '../../src/auth/tokenService';
import { Clock } from '../../src/clock';
import { aCandidate, aCommissioner, aVoter } from '../support/builders';
import { createTestPool, truncateAll } from './support/database';
import { givenFor } from './support/given';

// Component test (middle loop): the real app and the real database, but a fixed clock so that
// `closedAt` is something I can compare with.
describe('closing a poll (component test: app + real Postgres)', () => {
  const closingTime = new Date('2026-10-04T12:00:00.000Z');
  const fixedClock: Clock = { now: () => closingTime };

  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let given: ReturnType<typeof givenFor>;

  beforeAll(() => {
    pool = createTestPool();
    const tokens = new JwtTokenService('test-secret');
    app = createApp(pgDeps(pool, tokens, { clock: fixedClock }));
    given = givenFor(pool, tokens);
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /districts/:id/close', () => {
    it('lets a commissioner close the poll and answers with the closing time', async () => {
      const commissioner = await given.user(aCommissioner());

      const response = await request(app)
        .post('/districts/CM-3/close')
        .set('Authorization', `Bearer ${commissioner.token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ districtId: 'CM-3', closedAt: closingTime.toISOString() });
    });

    it('answers 403 to a voter', async () => {
      const voter = await given.user(aVoter().inDistrict('CM-3'));

      const response = await request(app).post('/districts/CM-3/close').set('Authorization', `Bearer ${voter.token}`);

      expect(response.status).toBe(403);
    });

    it('answers 401 when nobody is logged in', async () => {
      const response = await request(app).post('/districts/CM-3/close');

      expect(response.status).toBe(401);
    });

    it('answers 409 when the poll is already closed', async () => {
      const commissioner = await given.user(aCommissioner());
      await request(app).post('/districts/CM-3/close').set('Authorization', `Bearer ${commissioner.token}`);

      const second = await request(app)
        .post('/districts/CM-3/close')
        .set('Authorization', `Bearer ${commissioner.token}`);

      expect(second.status).toBe(409);
    });

    it('answers 404 for a district that does not exist', async () => {
      const commissioner = await given.user(aCommissioner());

      const response = await request(app)
        .post('/districts/ZZ-99/close')
        .set('Authorization', `Bearer ${commissioner.token}`);

      expect(response.status).toBe(404);
    });

    it('closes only the district that was asked for', async () => {
      const commissioner = await given.user(aCommissioner());
      await request(app).post('/districts/CM-3/close').set('Authorization', `Bearer ${commissioner.token}`);

      const other = await request(app).get('/districts/CM-2/results');

      expect(other.body.closed).toBe(false);
    });
  });

  describe('GET /districts/:id/results', () => {
    async function givenTwoCandidatesAndVotes() {
      const [partyA, partyB, partyC] = [await given.party(), await given.party(), await given.party()];
      const first = await given.candidate(aCandidate().inDistrict('CM-3').forParty(partyA.id).numbered(1));
      const second = await given.candidate(aCandidate().inDistrict('CM-3').forParty(partyB.id).numbered(2));
      await given.candidate(aCandidate().inDistrict('CM-3').forParty(partyC.id).numbered(3)); // nobody votes for this one
      const voters = [
        await given.user(aVoter().inDistrict('CM-3')),
        await given.user(aVoter().inDistrict('CM-3')),
        await given.user(aVoter().inDistrict('CM-3')),
      ];
      await given.vote(voters[0].user, first);
      await given.vote(voters[1].user, first);
      await given.vote(voters[2].user, second);
    }

    it('shows no scores while the poll is open', async () => {
      await givenTwoCandidatesAndVotes();

      const response = await request(app).get('/districts/CM-3/results');

      expect(response.body.closed).toBe(false);
      expect(response.body).not.toHaveProperty('closedAt');
      expect(response.body.candidates).toHaveLength(3);
      expect(response.body.candidates.every((c: object) => !('votes' in c))).toBe(true);
    });

    it('counts the votes of every candidate after the poll is closed, including zero', async () => {
      await givenTwoCandidatesAndVotes();
      const commissioner = await given.user(aCommissioner());
      await request(app).post('/districts/CM-3/close').set('Authorization', `Bearer ${commissioner.token}`);

      const response = await request(app).get('/districts/CM-3/results');

      expect(response.body.closed).toBe(true);
      expect(response.body.closedAt).toBe(closingTime.toISOString());
      expect(response.body.candidates.map((c: { number: number; votes: number }) => [c.number, c.votes])).toEqual([
        [1, 2],
        [2, 1],
        [3, 0],
      ]);
    });
  });
});
