import { Pool } from 'pg';
import { PartyRepository, PgPartyRepository } from '../../src/repositories/partyRepository';
import { aParty } from '../support/builders';
import { InMemoryPartyRepository } from '../support/inMemoryRepositories';
import { createTestPool, truncateAll } from './support/database';

// Contract test: ONE set of expectations, run against the fake and against the real Postgres repository.
// If both pass, the fake used in the unit tests behaves like the real thing (it is not "lying").
function partyRepositoryContract(
  name: string,
  create: () => PartyRepository,
  reset: () => Promise<void> = async () => {},
) {
  describe(`PartyRepository contract: ${name}`, () => {
    let repo: PartyRepository;

    beforeEach(async () => {
      await reset();
      repo = create();
    });

    it('gives a new party an id and keeps the data', async () => {
      const saved = await repo.create(aParty().named('Blue').build());

      expect(saved).toMatchObject({ name: 'Blue', logoUrl: null });
      expect(saved.id).toEqual(expect.any(Number));
    });

    it('finds a party by id and by name', async () => {
      const saved = await repo.create(aParty().named('Blue').build());

      expect(await repo.findById(saved.id)).toEqual(saved);
      expect(await repo.findByName('Blue')).toEqual(saved);
    });

    it('returns null for an unknown id or name', async () => {
      expect(await repo.findById(999999)).toBeNull();
      expect(await repo.findByName('Nobody')).toBeNull();
    });

    it('lists the parties ordered by name', async () => {
      await repo.create(aParty().named('Charlie').build());
      await repo.create(aParty().named('Alpha').build());
      await repo.create(aParty().named('Bravo').build());

      const names = (await repo.findAll()).map((p) => p.name);

      expect(names).toEqual(['Alpha', 'Bravo', 'Charlie']);
    });
  });
}

partyRepositoryContract('in-memory fake', () => new InMemoryPartyRepository());

describe('with the real database', () => {
  const pool: Pool = createTestPool();

  afterAll(async () => {
    await pool.end();
  });

  partyRepositoryContract(
    'Postgres',
    () => new PgPartyRepository(pool),
    () => truncateAll(pool),
  );
});
