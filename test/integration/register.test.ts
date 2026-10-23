import request from 'supertest';
import { Pool } from 'pg';
import { createApp, pgDeps } from '../../src/app';
import { JwtTokenService } from '../../src/auth/tokenService';
import { aVoter } from '../support/builders';
import { anInvalidNationalId } from '../support/nationalIds';
import { createTestPool, truncateAll } from './support/database';
import { givenFor } from './support/given';

describe('POST /auth/register (component test: app + real Postgres)', () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let given: ReturnType<typeof givenFor>;

  beforeAll(() => {
    pool = createTestPool();
    const tokens = new JwtTokenService('test-secret');
    app = createApp(pgDeps(pool, tokens));
    given = givenFor(pool, tokens);
  });

  // Fresh fixture: every test starts from an empty database, so tests cannot affect each other.
  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('registers a voter who can then log in', async () => {
    const voter = aVoter().inDistrict('CM-1');
    const registration = voter.buildRegistration();

    const registered = await request(app).post('/auth/register').send(registration);
    const login = await request(app)
      .post('/auth/login')
      .send({ nationalId: registration.nationalId, password: registration.password });

    expect(registered.status).toBe(201);
    expect(registered.body).toMatchObject({ nationalId: registration.nationalId, role: 'VOTER', districtId: 'CM-1' });
    expect(registered.body).not.toHaveProperty('passwordHash');
    expect(login.status).toBe(200);
    expect(login.body.token).toEqual(expect.any(String));
  });

  it('answers 400 for a national id with a wrong checksum', async () => {
    const registration = { ...aVoter().buildRegistration(), nationalId: anInvalidNationalId() };

    const response = await request(app).post('/auth/register').send(registration);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid national id' });
  });

  it('answers 400 for a district that does not exist', async () => {
    const registration = aVoter().inDistrict('ZZ-99').buildRegistration();

    const response = await request(app).post('/auth/register').send(registration);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'unknown district' });
  });

  it('answers 409 when the national id is already registered', async () => {
    const existing = await given.user(aVoter());
    const registration = aVoter().withNationalId(existing.user.nationalId).buildRegistration();

    const response = await request(app).post('/auth/register').send(registration);

    expect(response.status).toBe(409);
  });

  it('answers 401 when logging in with a wrong password', async () => {
    const existing = await given.user(aVoter().withPassword('right-password'));

    const response = await request(app)
      .post('/auth/login')
      .send({ nationalId: existing.user.nationalId, password: 'wrong-password' });

    expect(response.status).toBe(401);
  });
});
