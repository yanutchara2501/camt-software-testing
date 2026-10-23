import request from 'supertest';
import { Pool } from 'pg';
import { createApp, pgDeps } from '../../src/app';
import { JwtTokenService } from '../../src/auth/tokenService';
import { Candidate } from '../../src/domain/types';
import { pool as legacyPool } from '../../src/db';
import { aCandidate, aCommissioner, aVoter } from '../support/builders';
import { createTestPool, truncateAll } from './support/database';
import { givenFor } from './support/given';

// CHARACTERIZATION TESTS (Feathers, "Working Effectively with Legacy Code").
// They do not say what the vote route SHOULD do. They pin down what it DOES today, so that I can change the
// code around it and see immediately if I changed the behaviour by accident.
// A "weird" result is written down as it is and marked with WEIRD, but not fixed here.
describe('vote routes: characterization', () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let given: ReturnType<typeof givenFor>;
  let first: Candidate;
  let second: Candidate;

  beforeAll(() => {
    pool = createTestPool();
    const tokens = new JwtTokenService('test-secret');
    app = createApp(pgDeps(pool, tokens));
    given = givenFor(pool, tokens);
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await given.electionOpenedAt(new Date(Date.now() - 60 * 60 * 1000)); // opened an hour ago (real time: no seam for the clock yet)
    first = await given.candidate(aCandidate().inDistrict('CM-1').forParty((await given.party()).id).numbered(1));
    second = await given.candidate(aCandidate().inDistrict('CM-1').forParty((await given.party()).id).numbered(2));
  });

  afterAll(async () => {
    await pool.end();
    await legacyPool.end(); // the legacy route uses its own global pool, which is why this line is needed at all
  });

  describe('PUT /me/vote', () => {
    it('records the first vote with 201 and changed:false', async () => {
      const voter = await given.user(aVoter().inDistrict('CM-1'));

      const response = await request(app)
        .put('/me/vote')
        .set('Authorization', `Bearer ${voter.token}`)
        .send({ candidateId: first.id });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ candidateId: first.id, changed: false });
      expect(new Date(response.body.votedAt).getTime()).not.toBeNaN();
    });

    it('lets the voter change the vote: 200 and changed:true, and still only one row for the voter', async () => {
      const voter = await given.user(aVoter().inDistrict('CM-1'));
      await request(app).put('/me/vote').set('Authorization', `Bearer ${voter.token}`).send({ candidateId: first.id });

      const response = await request(app)
        .put('/me/vote')
        .set('Authorization', `Bearer ${voter.token}`)
        .send({ candidateId: second.id });

      const rows = await pool.query('SELECT candidate_id FROM votes WHERE voter_id = $1', [voter.user.id]);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ candidateId: second.id, changed: true });
      expect(rows.rows).toEqual([{ candidate_id: second.id }]);
    });

    it('answers 401 without a token', async () => {
      const response = await request(app).put('/me/vote').send({ candidateId: first.id });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'authentication required' });
    });

    it('answers 401 for a token that is garbage', async () => {
      const response = await request(app)
        .put('/me/vote')
        .set('Authorization', 'Bearer not-a-token')
        .send({ candidateId: first.id });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'authentication required' });
    });

    it('answers 403 to somebody who is not a voter', async () => {
      const commissioner = await given.user(aCommissioner().inDistrict('CM-1'));

      const response = await request(app)
        .put('/me/vote')
        .set('Authorization', `Bearer ${commissioner.token}`)
        .send({ candidateId: first.id });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'only voters can vote' });
    });

    it('answers 400 when candidateId is missing', async () => {
      const voter = await given.user(aVoter().inDistrict('CM-1'));

      const response = await request(app).put('/me/vote').set('Authorization', `Bearer ${voter.token}`).send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'candidateId is required' });
    });

    it('answers 409 "election is not open" before the opening time', async () => {
      await given.electionOpenedAt(new Date(Date.now() + 60 * 60 * 1000));
      const voter = await given.user(aVoter().inDistrict('CM-1'));

      const response = await request(app)
        .put('/me/vote')
        .set('Authorization', `Bearer ${voter.token}`)
        .send({ candidateId: first.id });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'election is not open' });
    });

    it('answers 409 "election is not open" when there is no election row at all', async () => {
      await pool.query('DELETE FROM election');
      const voter = await given.user(aVoter().inDistrict('CM-1'));

      const response = await request(app)
        .put('/me/vote')
        .set('Authorization', `Bearer ${voter.token}`)
        .send({ candidateId: first.id });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'election is not open' });
    });

    it('answers 404 for a candidate that does not exist', async () => {
      const voter = await given.user(aVoter().inDistrict('CM-1'));

      const response = await request(app)
        .put('/me/vote')
        .set('Authorization', `Bearer ${voter.token}`)
        .send({ candidateId: 999999 });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'candidate not found' });
    });

    it('answers 403 for a candidate of another district', async () => {
      const voter = await given.user(aVoter().inDistrict('CM-2'));

      const response = await request(app)
        .put('/me/vote')
        .set('Authorization', `Bearer ${voter.token}`)
        .send({ candidateId: first.id }); // first is in CM-1

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'candidate is not in your district' });
    });

    describe('strange inputs', () => {
      it('WEIRD: candidateId 0 is treated as "missing" (400), because the code checks for a falsy value', async () => {
        const voter = await given.user(aVoter().inDistrict('CM-1'));

        const response = await request(app).put('/me/vote').set('Authorization', `Bearer ${voter.token}`).send({ candidateId: 0 });

        expect(response.status).toBe(400);
      });

      it('WEIRD: a numeric string such as "1" works, and the answer turns it back into a number', async () => {
        const voter = await given.user(aVoter().inDistrict('CM-1'));

        const response = await request(app)
          .put('/me/vote')
          .set('Authorization', `Bearer ${voter.token}`)
          .send({ candidateId: String(first.id) });

        expect(response.status).toBe(201);
        expect(response.body.candidateId).toBe(first.id);
      });

      it('WEIRD: candidateId "abc" reaches the database and ends as a 500 instead of a 400', async () => {
        const voter = await given.user(aVoter().inDistrict('CM-1'));
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        const response = await request(app)
          .put('/me/vote')
          .set('Authorization', `Bearer ${voter.token}`)
          .send({ candidateId: 'abc' });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'internal server error' });
        consoleError.mockRestore();
      });

      // This used to be: 'WEIRD: the token is accepted even without the "Bearer " prefix' (201).
      // Moving to the shared authenticate() middleware changed it on purpose: every other route already
      // requires the Bearer scheme, so the vote route now does the same. The old test went red and I updated it
      // knowingly (see docs/workshop/07-legacy.md).
      it('requires the "Bearer " prefix, like every other route', async () => {
        const voter = await given.user(aVoter().inDistrict('CM-1'));

        const response = await request(app).put('/me/vote').set('Authorization', voter.token).send({ candidateId: first.id });

        expect(response.status).toBe(401);
      });
    });

    it('writes a log line for the vote (somebody may depend on it)', async () => {
      const voter = await given.user(aVoter().inDistrict('CM-1'));
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});

      await request(app).put('/me/vote').set('Authorization', `Bearer ${voter.token}`).send({ candidateId: first.id });

      expect(log).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^\\[vote\\] voter ${voter.user.id} voted for ${first.id} at `)));
      log.mockRestore();
    });
  });

  describe('GET /me/candidates', () => {
    it('lists the candidates of the voter\'s own district in number order, none selected at first', async () => {
      const voter = await given.user(aVoter().inDistrict('CM-1'));
      await given.candidate(aCandidate().inDistrict('CM-2').forParty((await given.party()).id)); // other district

      const response = await request(app).get('/me/candidates').set('Authorization', `Bearer ${voter.token}`);

      expect(response.status).toBe(200);
      expect(response.body.map((c: { number: number; selected: boolean }) => [c.number, c.selected])).toEqual([
        [1, false],
        [2, false],
      ]);
    });

    it('marks the candidate that the voter chose', async () => {
      const voter = await given.user(aVoter().inDistrict('CM-1'));
      await request(app).put('/me/vote').set('Authorization', `Bearer ${voter.token}`).send({ candidateId: second.id });

      const response = await request(app).get('/me/candidates').set('Authorization', `Bearer ${voter.token}`);

      expect(response.body.map((c: { number: number; selected: boolean }) => [c.number, c.selected])).toEqual([
        [1, false],
        [2, true],
      ]);
    });

    it('answers 401 without a token', async () => {
      const response = await request(app).get('/me/candidates');

      expect(response.status).toBe(401);
    });
  });
});
