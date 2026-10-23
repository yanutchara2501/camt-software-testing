import { Pool } from 'pg';
import { DistrictRepository, PgDistrictRepository } from '../../src/repositories/districtRepository';
import { InMemoryDistrictRepository } from '../support/inMemoryRepositories';
import { createTestPool, truncateAll } from './support/database';

// Same idea as the party repository contract test: the fake used by the PollService unit tests
// must close a poll exactly like the real SQL does.
function closingContract(name: string, create: () => DistrictRepository, reset: () => Promise<void> = async () => {}) {
  describe(`DistrictRepository closing contract: ${name}`, () => {
    const at = new Date('2026-10-04T12:00:00.000Z');
    let repo: DistrictRepository;

    beforeEach(async () => {
      await reset();
      repo = create();
    });

    it('has no closing time before the poll is closed', async () => {
      expect(await repo.closedAt('CM-1')).toBeNull();
    });

    it('stores the closing time and reports that it closed the poll', async () => {
      const closed = await repo.close('CM-1', at);

      expect(closed).toBe(true);
      expect(await repo.closedAt('CM-1')).toEqual(at);
    });

    it('refuses to close twice and keeps the first closing time', async () => {
      await repo.close('CM-1', at);

      const closedAgain = await repo.close('CM-1', new Date('2026-10-05T00:00:00.000Z'));

      expect(closedAgain).toBe(false);
      expect(await repo.closedAt('CM-1')).toEqual(at);
    });
  });
}

closingContract(
  'in-memory fake',
  () => new InMemoryDistrictRepository([{ id: 'CM-1', province: 'Chiang Mai', number: 1 }]),
);

describe('with the real database', () => {
  const pool: Pool = createTestPool();

  afterAll(async () => {
    await pool.end();
  });

  closingContract(
    'Postgres',
    () => new PgDistrictRepository(pool),
    () => truncateAll(pool),
  );
});
