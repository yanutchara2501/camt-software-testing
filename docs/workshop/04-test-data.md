# Step 04 - Test data management

Branch: `step/04-test-data`

## Part A - The database schema is code (Liquibase)

The schema lives in git as versioned files (`db/changelog/changes/NNN-*.sql`) and every environment
(dev, test, CI, e2e) gets it with the same command. The test database is therefore always built from the
migrations and never from a hand-made dump.

Experiments I ran on the test database (and then reverted, so nothing is left in the repo):

| Experiment | What happened | What I learned |
|---|---|---|
| Added `005-practice.sql` (`ALTER TABLE parties ADD COLUMN slogan TEXT`, with `--rollback`) **without** adding it to `db.changelog-master.yaml`, then ran `update` | `Run: 0`, no error | A changelog file that is not listed in the master file never runs, and Liquibase says nothing. I must add the `include` by hand. |
| Added the `include` after the `tag-day1` changeset and ran `update` | `Run: 9`, the `slogan` column exists | The new changeset ran in the order of the master file. |
| `rollback-count --count=1` | The `slogan` column was gone again | A changeset is only safely reversible if it has a correct `--rollback` line. |
| Edited `003-parties-candidates.sql` (changed `policy TEXT NOT NULL` to `policy TEXT`) and ran `update` | `Validation Failed: 1 changesets check sum` | Liquibase stores a checksum for each applied changeset, so an old changeset can not be edited silently. A schema change needs a **new** file. |
| (Earlier, by mistake) `rollback-count 1` when the last changeset was the `tag-day1` changeset | It rolled back the tag itself | A tag created by a `tagDatabase` changeset is also a changeset and it can be rolled back. |

**Contexts.** Seed files are tagged `context:dev`. The test database is migrated with `LIQUIBASE_COMMAND_CONTEXTS=test`,
so test data never depends on the dev seed. A dev DB has sample users, a test DB starts empty.

## Part B - Test data builders and faker

Problem: a component test needs a user, a party and a candidate. If every test writes the full objects, the
test is long and I cannot see which values matter for this test.

```ts
// before: which value matters?
await users.create({ nationalId: '1509900000017', passwordHash: '...', firstName: 'Somchai', ... districtId: 'CM-2' });

// after: only the important part is visible
const voter = await given.user(aVoter().inDistrict('CM-2'));
```

| File | Role |
|---|---|
| `test/support/builders.ts` | **Test Data Builders**: `aVoter()`, `aCommissioner()`, `anAdmin()`, `aParty()`, `aCandidate()`. They are immutable, `inDistrict()` returns a new builder. |
| `test/support/nationalIds.ts` | creates a national id with a **correct checksum** (and one with a wrong checksum) |
| `test/support/seedFaker.ts`, `setupFaker.ts` | fixed faker seed that is reset before every test (see below) |
| `test/integration/support/given.ts` | **Creation Methods**: save data in the real DB and return what the test needs, such as ids and a token |

**Faker.** The unimportant values (names, address, policy text) come from `@faker-js/faker`; Thai names come from `fakerTH`.
Random data finds assumptions that hand-written data hides, but random data makes a failure hard to reproduce.
So the seed is fixed (`20261003`) and reset before each test. A red test can always be re-run with exactly the same data,
and `FAKER_SEED=123 npm test` explores other data.

The builders are code too, so `test/unit/builders.test.ts` checks that the generated national ids are valid for
several seeds. If it did not, many tests would fail for the wrong reason.

## Part C - Isolation and the contract test

* **Fresh fixture.** `beforeEach` truncates all tables (`truncateAll`), so each test builds its own data and no test depends on another.
  The integration project runs `--runInBand`, because all files share one database.
* **Contract test.** `test/integration/partyRepository.contract.test.ts` runs the same expectations against
  `InMemoryPartyRepository` (the fake from step 03) and `PgPartyRepository` (real Postgres). If both are green, the fake is not lying.
* **Component tests.** `elections.test.ts` and the extended `register.test.ts` use supertest, the real app and the real database.
  The wiring rules (401/403/409/404) are checked here, while the business rules stay in the unit tests.

## Concepts used in this step

* **Fresh fixture vs. shared fixture** (xUnit Test Patterns). I use a fresh fixture.
* **Test Data Builder** and **Creation Method** patterns
* **Database migration as code**, rollback, checksum validation, contexts
* **Seeded random test data** (faker) for repeatability
* **Contract test** to keep a fake and the real implementation in line
* **Test isolation** - the result must not depend on test order
