import request from 'supertest';
import { Pool } from 'pg';
import { createApp, pgDeps } from '../../src/app';
import { JwtTokenService } from '../../src/auth/tokenService';
import { aCandidate, aCommissioner, aParty, aVoter } from '../support/builders';
import { createTestPool, truncateAll } from './support/database';
import { givenFor } from './support/given';

describe('election administration (component test: app + real Postgres)', () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let given: ReturnType<typeof givenFor>;

  beforeAll(() => {
    pool = createTestPool();
    const tokens = new JwtTokenService('test-secret');
    app = createApp(pgDeps(pool, tokens));
    given = givenFor(pool, tokens);
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /parties', () => {
    it('lets a commissioner create a party', async () => {
      const commissioner = await given.user(aCommissioner());
      const party = aParty().named('Blue Party').build();

      const response = await request(app)
        .post('/parties')
        .set('Authorization', `Bearer ${commissioner.token}`)
        .send(party);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ name: 'Blue Party', policy: party.policy });
    });

    it('answers 403 to a voter', async () => {
      const voter = await given.user(aVoter());

      const response = await request(app)
        .post('/parties')
        .set('Authorization', `Bearer ${voter.token}`)
        .send(aParty().build());

      expect(response.status).toBe(403);
    });

    it('answers 401 when nobody is logged in', async () => {
      const response = await request(app).post('/parties').send(aParty().build());

      expect(response.status).toBe(401);
    });

    it('answers 409 for a party name that is already taken', async () => {
      const commissioner = await given.user(aCommissioner());
      await given.party(aParty().named('Blue Party'));

      const response = await request(app)
        .post('/parties')
        .set('Authorization', `Bearer ${commissioner.token}`)
        .send(aParty().named('Blue Party').build());

      expect(response.status).toBe(409);
    });
  });

  describe('POST /districts/:id/candidates', () => {
    it('lets a commissioner add a candidate, and the party page then lists the candidate', async () => {
      const commissioner = await given.user(aCommissioner());
      const party = await given.party();
      const candidate = aCandidate().forParty(party.id).numbered(3).build();

      const created = await request(app)
        .post('/districts/CM-2/candidates')
        .set('Authorization', `Bearer ${commissioner.token}`)
        .send(candidate);
      const partyPage = await request(app).get(`/parties/${party.id}`);

      expect(created.status).toBe(201);
      expect(partyPage.body.candidates).toEqual([expect.objectContaining({ districtId: 'CM-2', number: 3 })]);
    });

    it('answers 409 when the number is already used in the district', async () => {
      const commissioner = await given.user(aCommissioner());
      const first = await given.party();
      const second = await given.party();
      await given.candidate(aCandidate().inDistrict('CM-1').forParty(first.id).numbered(1));

      const response = await request(app)
        .post('/districts/CM-1/candidates')
        .set('Authorization', `Bearer ${commissioner.token}`)
        .send(aCandidate().forParty(second.id).numbered(1).build());

      expect(response.status).toBe(409);
    });

    it('answers 404 for a district that does not exist', async () => {
      const commissioner = await given.user(aCommissioner());
      const party = await given.party();

      const response = await request(app)
        .post('/districts/ZZ-99/candidates')
        .set('Authorization', `Bearer ${commissioner.token}`)
        .send(aCandidate().forParty(party.id).build());

      expect(response.status).toBe(404);
    });
  });

  describe('GET /districts/:id/results', () => {
    it('lists the candidates ordered by number and shows no scores while the poll is open', async () => {
      const first = await given.party();
      const second = await given.party();
      await given.candidate(aCandidate().inDistrict('CM-1').forParty(second.id).numbered(2));
      await given.candidate(aCandidate().inDistrict('CM-1').forParty(first.id).numbered(1));

      const response = await request(app).get('/districts/CM-1/results');

      expect(response.status).toBe(200);
      expect(response.body.closed).toBe(false);
      expect(response.body.candidates.map((c: { number: number }) => c.number)).toEqual([1, 2]);
      expect(response.body.candidates[0]).not.toHaveProperty('votes');
    });

    it('answers 404 for a district that does not exist', async () => {
      const response = await request(app).get('/districts/ZZ-99/results');

      expect(response.status).toBe(404);
    });
  });
});
