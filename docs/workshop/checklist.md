# Readiness checklist

Score: 0 = not there, 1 = partly / manual, 2 = complete and automatic.
Round 1 was filled at the start of the work (the starter code of this repo).
Round 2 is filled at the end of step 08.

| # | Area | Item | Round 1 | Round 2 |
|---|---|---|---|---|
| 1 | Structure | Test boundaries are clearly named | 2 | 2 |
| 2 | Structure | No-I/O tests are separated from tests that need a DB | 2 | 2 |
| 3 | Structure | All tests run with one command | 1 | 2 |
| 4 | Environment | Test DB is built from versioned migrations | 2 | 2 |
| 5 | Environment | No manual database steps | 2 | 2 |
| 6 | Environment | Tests run the same locally and in CI | 0 | 1 |
| 7 | Data | Test data comes from builders / factories | 0 | 2 |
| 8 | Data | Tests do not depend on each other | 1 | 2 |
| 9 | Data | Time and randomness are controllable | 1 | 2 |
| 10 | Design | Important dependencies are injectable (seams) | 1 | 2 |
| 11 | Design | Test doubles are used at the right level | 0 | 2 |
| 12 | Design | The riskiest legacy part has characterization tests | 0 | 2 |
| | | **Total (of 24)** | **12** | **23** |

Notes for round 1:

* 3: `npm test` runs unit + integration but e2e is a separate command.
* 6: there is no CI file in my repository yet (step 05 adds it).
* 8, 9, 10: only the vote routes read the real clock and a global pool, and there is only one integration test so far.

First things to fix after round 1 (each can be done in one day): CI (6), builders (7), doubles (11), characterization tests (12).

## Round 2 (end of step 08)

| # | Evidence |
|---|---|
| 3 | `npm run test:all` runs unit, integration and e2e with one command. |
| 6 | `.github/workflows/ci.yml` calls the same npm scripts. It scores 1 and not 2 only because it has not run on GitHub yet. |
| 7 | `test/support/builders.ts` and `test/integration/support/given.ts`. |
| 8 | Unit and integration suites pass in random order too (`jest --randomize`, two different seeds each). Each integration test truncates the tables first. |
| 9 | `Clock` is injected everywhere (also in the vote routes now), fake timers are used for the JWT library, and faker has a fixed seed. |
| 10 | Pool, token service, clock and repositories come in through `createApp(deps)`. The raw pool in `AppDeps` is known debt, but it is injectable. |
| 11 | Dummy/stub/spy/mock for rules of the services, fakes for repositories, real Postgres for SQL. The pool is never mocked. |
| 12 | `test/integration/vote.characterization.test.ts` pinned the legacy vote routes before they were changed. |

Biggest change: items 7, 11 and 12 went from 0 to 2. The next thing to do is to run the pipeline on GitHub (6).
Not done yet: a `VoteService` for the vote logic (it is still SQL inside the route), which is the subject of the V&V branch.
