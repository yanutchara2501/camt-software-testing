# Election Backend - Software Testing Assignment

An election backend (Express + TypeScript + PostgreSQL + Liquibase) with an automated test suite on every level:
unit, integration/component and end-to-end. It is my submission for the Software Testing assignment (15%).

* Part 1: the workshop labs (3-4 October) re-implemented, **one Git branch per step**.
* Part 2: unit test design, original-vs-improved code comparison and unit tests (success, failure, stub, spy, mock, Faker) for the Election App.

All text and code in this repository were written for this assignment. The starting code (the election backend and the labs) is the workshop material;
the tests, notes and every change after the first commit are my own work and can be followed commit by commit.

## Contents

1. [Quick start](#1-quick-start)
2. [What is in the repository](#2-what-is-in-the-repository)
3. [Branches (one per workshop step)](#3-branches)
4. [Assignment checklist: where to find each requirement](#4-assignment-checklist)
5. [Testing concepts applied](#5-testing-concepts-applied)
6. [Commands](#6-commands)
7. [Application reference (API, architecture, database)](#7-application-reference)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Quick start

### Requirements

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 24 or newer | everything |
| npm | comes with Node | everything |
| Docker Desktop (with Compose v2) | any recent | integration and e2e tests only |
| Git | any recent | switching between branches |

The **unit tests need no Docker and no database**.

### Step by step

```bash
# 1. get the code
git clone <url-of-this-repository> election-testing
cd election-testing

# 2. install the dependencies
npm ci

# 3. check that the machine is ready (tools, Docker, database, one test per level)
npm run doctor

# 4. unit tests - seconds, no Docker
npm run test:unit

# 5. integration + component tests - starts Postgres in Docker, runs Liquibase, then Jest
npm run test:integration

# 6. end-to-end tests - builds the app image, starts it with its own database, then Playwright over HTTP
npm run test:e2e

# or all three in a row
npm run test:all
```

Expected result on `main` (this is what I get on my laptop):

| Command | Result | Time |
|---|---|---|
| `npm run test:unit` | 154 tests pass | ~10 s |
| `npm run test:integration` | 71 tests pass | ~30 s (including starting the database) |
| `npm run test:e2e` | 2 tests pass | ~1.5 min the first time (image build), then faster |
| `npm run test:coverage` | 154 tests pass and the coverage gate is satisfied | ~20 s |
| `npm run db:test-rollback` | every migration can be rolled back and re-applied | ~15 s |

When you are finished: `npm run db:down` stops and removes every container of this project.

### Looking at one step of the workshop

```bash
git branch                       # list the branches
git switch step/03-test-doubles  # go to one step
npm ci                           # (only if package.json changed between the steps)
npm run test:unit                # the tests of that step
```

Each step branch contains the code **and** its explanation in `docs/workshop/NN-*.md`.

---

## 2. What is in the repository

```
src/                      application code
  app.ts                  createApp(deps): every dependency is injected
  auth/ domain/           token + password code, Thai national id checksum, ballot rules
  services/               business rules: Account, ElectionAdmin, Poll, Vote
  repositories/           interface + Postgres implementation for each aggregate
  routes/                 HTTP only
test/
  unit/                   no I/O, runs in parallel      (npm run test:unit)
    election/             assignment part 2.3 suite     (registration, login, poll closing)
  integration/            app in-process + real Postgres (npm run test:integration)
  support/                builders, faker seed, national id generator, in-memory fakes
e2e/                      Playwright over HTTP against the app container
db/                       Liquibase changelog (schema as versioned files) + its Dockerfile
docs/
  workshop/               explanation of every workshop step, test cases, checklist
  election-app/           unit test design (2.1) and code comparison (2.2)
.github/workflows/ci.yml  pipeline: unit -> integration -> e2e
```

### Test boundaries

| Boundary | Where | Tool | Talks to |
|---|---|---|---|
| Unit | `test/unit/` | Jest | nothing outside the process, collaborators are test doubles |
| Component / integration | `test/integration/` | Jest + supertest | the app in-process and a real Postgres (`db-test`, port 5433) |
| End-to-end | `e2e/` | Playwright | the app container over HTTP, as a black box (`db-e2e`, port 5434) |

---

## 3. Branches

The step branches are **cumulative**: every branch starts from the previous one, like the workshop. `main` equals the last branch.
Use `git log --oneline --graph --all` to see the history.

| Branch | Workshop step / assignment item | Explanation |
|---|---|---|
| `main` | final result of everything + this README | - |
| `step/00-setup` | Lab 00: run all test levels, red/green experiment | [docs/workshop/00-setup.md](docs/workshop/00-setup.md) |
| `step/01-boundaries` | Lab 01: test boundaries, my test cases, checklist round 1 | [01-boundaries.md](docs/workshop/01-boundaries.md), [test-cases.md](docs/workshop/test-cases.md) |
| `step/02-aaa-unit` | Lab 02: Arrange-Act-Assert, test smells | [02-aaa-unit.md](docs/workshop/02-aaa-unit.md) |
| `step/03-test-doubles` | Lab 03: dummy, stub, spy, mock, fake; fake timers | [03-test-doubles.md](docs/workshop/03-test-doubles.md) |
| `step/04-test-data` | Lab 04: Liquibase, builders, faker, fixtures, contract test | [04-test-data.md](docs/workshop/04-test-data.md) |
| `step/05-ci` | Lab 05: CI pipeline, coverage gate, migration rollback test | [05-ci.md](docs/workshop/05-ci.md) |
| `step/06-outside-in` | Lab 06: outside-in TDD, "close the poll" feature | [06-outside-in.md](docs/workshop/06-outside-in.md) |
| `step/07-legacy` | Lab 07: characterization tests, seams, sprout | [07-legacy.md](docs/workshop/07-legacy.md) |
| `step/08-own-project` | Lab 08: apply everything, checklist round 2 | [08-own-project.md](docs/workshop/08-own-project.md) |
| `election/original` | 2.2: the code **before** V&V (first commit, untouched) | [code-comparison.md](docs/election-app/code-comparison.md) |
| `election/unit-tests` | 2.1 + 2.3: unit test design and unit test suite | [unit-test-design.md](docs/election-app/unit-test-design.md) |
| `election/vv-improved` | 2.2: the code **after** V&V, with tests | [code-comparison.md](docs/election-app/code-comparison.md) |

Commit messages start with the step (`Step 06: ...`). Inside a step the order of the commits tells the story: for example in step 06
the acceptance test is committed **red** first, then the component and unit tests, then the implementation that turns everything green.

---

## 4. Assignment checklist

| Requirement | Where |
|---|---|
| 1. Re-implement the workshop tasks, one branch per step, commit step by step | branches `step/00-setup` ... `step/08-own-project` (section 3) |
| 1. Explain the concepts of each branch in my own words | `docs/workshop/NN-*.md`, summary in section 5 |
| 2.1 Unit test design | [docs/election-app/unit-test-design.md](docs/election-app/unit-test-design.md) |
| 2.2 Branch with the original code | `election/original` |
| 2.2 Branch with the code improved with V&V | `election/vv-improved` |
| 2.2 Comparison: same / changed / why | [docs/election-app/code-comparison.md](docs/election-app/code-comparison.md) |
| 2.3.1 Success (happy path) test | `UT-A1`, `UT-B1`, `UT-C1` in `test/unit/election/` |
| 2.3.2 Alternative / failure test | `UT-A2`, `UT-A3a`, `UT-B3`, `UT-C2` in `test/unit/election/` |
| 2.3.3 Stub | `UT-A4` (stubbed repository) and `UT-C3` (stubbed clock) |
| 2.3.4 Spy | `UT-A5` (`jest.spyOn` on a real fake) in `registration.test.ts` |
| 2.3.5 Mock | `UT-B2` (token service with call expectations) in `login.test.ts`, `UT-C4` in `pollClosing.test.ts` |
| 2.3.6 Faker-generated data | `UT-A7`, `UT-A8`, `UT-C1` (and the builders in `test/support/builders.ts`) |
| README with setup and run steps | this file, section 1 |
| Testing theory used | section 5 |

To run only the assignment part 2.3 suite:

```bash
npx jest --selectProjects unit test/unit/election --verbose
```

---

## 5. Testing concepts applied

### Strategy and structure

* **Test pyramid and test boundaries** (Clemson / Fowler). Many fast unit tests, fewer component/integration tests, a few end-to-end journeys.
  For every case I choose the *lowest* boundary that still gives enough confidence. (step 00, 01)
* **Solitary vs. sociable unit tests**, **component test**, **contract test**, and what is *not* a functional test (load, visual). (step 01, 04)
* **Verification and Validation (V&V).** Verification = built the product right (defects, security, structure). Validation = built the right product
  (the user story works end to end). (part 2.2)

### Writing a good test

* **Four-phase test / Arrange-Act-Assert**, one behaviour per test, no logic in tests, names that read like a specification. (step 02)
* **Test smells** from *xUnit Test Patterns*: Obscure Test, Eager Test, Assertion Roulette, Conditional Test Logic, test without assertion. (step 02)
* **Data-driven tests** with `it.each`. (step 02, 04)
* **Red-green**: a test must be seen failing for the right reason. I also use small **mutations** (change the code, check that a test goes red). (all steps)

### Test design techniques (part 2.1)

* **Equivalence partitioning** (national id: valid, wrong checksum, wrong length, not digits)
* **Boundary value analysis** (password 7 vs. 8 characters, opening time, token lifetime)
* **Decision table** (ballot rules) and **state transition** (poll `OPEN -> CLOSED`)
* **Error guessing** (the same message for an unknown id and a wrong password)

### Test doubles (step 03, part 2.3)

| Double | Purpose | Example in this repo |
|---|---|---|
| Dummy | passed in, never used (it throws if used) | unused `TokenService` in registration tests |
| Stub | feeds a canned answer in (indirect input) | `districtsWithCm1`, stubbed clock |
| Spy | records calls so I can check them afterwards | `jest.spyOn(users, 'create')` |
| Mock | has expectations about how it must be called | token service must be called once with this principal |
| Fake | a simple but working implementation | `InMemory*Repository` in `test/support` |

Related ideas: state vs. behaviour verification, do not mock what you do not own (the `pg` Pool is never mocked), **fake timers vs. an injected `Clock`**, and a
**contract test** that runs one set of expectations on the fake and on Postgres so the fake cannot lie.

### Test data and environment (step 04, 05)

* **Fresh fixture**, test isolation (tests also pass in random order: `jest --randomize`)
* **Test Data Builder** and **Creation Method**, **seeded random data** (Faker with a fixed seed so a red test can be repeated)
* **Database migrations as code** (Liquibase): versioned files, checksums, contexts, rollback, the schema is built from scratch for each test run
* **Continuous integration** as "a person who presses the button": fail fast, same npm scripts locally and in CI
* **Quality gates**: coverage threshold only on the folders where unit tests are the right tool, and a migration rollback test.
  Coverage measures what ran, not what was checked.

### Process and legacy code (step 06, 07)

* **Outside-in / double-loop TDD** and walking skeleton. The unit test of the service *discovers* which collaborators it needs. (step 06)
* **Legacy code change algorithm**, **characterization tests**, **seams**, **Parameterize Constructor**, **Sprout Method/Class**. (step 07)
* A characterization test is not holy: a deliberate behaviour change updates the test and says so in the commit message.

---

## 6. Commands

| Command | What it does |
|---|---|
| `npm run doctor` | check tools, Docker, database, migrations and one test per level |
| `npm run typecheck` | `tsc --noEmit` over source, tests and e2e |
| `npm run test:unit` | Jest `unit` project, no I/O |
| `npm run test:coverage` | unit tests with coverage and the threshold gate (`coverage/` has the HTML report) |
| `npm run test:integration` | start test Postgres (port 5433), run Liquibase, then Jest `integration` project in band |
| `npm run test:e2e` | fresh e2e Postgres (5434), Liquibase, app container, then Playwright |
| `npm run test:all` | unit, then integration, then e2e |
| `npm run db:test-rollback` | reset the test DB and run Liquibase `update-testing-rollback` |
| `npm run db:reset:test` | recreate the test database from scratch |
| `npm run db:up` / `db:migrate` | development database (port 5432) with sample data |
| `npm run dev` | run the app with reload on http://localhost:3000 (needs `db:up` and `db:migrate`) |
| `npm run db:down` | stop and remove all containers of this project (the dev DB volume is kept) |
| `FAKER_SEED=123 npm run test:unit` | run the tests with other generated data |

---

## 7. Application reference

### API

| Method | Path | Who |
|---|---|---|
| GET | `/health` | anyone |
| POST | `/auth/register` | anyone |
| POST | `/auth/login` | anyone |
| PATCH | `/admin/users/:id/role` | ADMIN |
| GET | `/districts`, `/parties`, `/parties/:id` | anyone |
| POST | `/parties` | COMMISSIONER |
| POST | `/districts/:id/candidates` | COMMISSIONER |
| POST | `/districts/:id/close` | COMMISSIONER (closes the poll of a district) |
| GET | `/districts/:id/results` | anyone (scores hidden until the poll is closed) |
| GET | `/me/candidates` | logged-in voter |
| PUT | `/me/vote` | VOTER (not allowed after the district is closed) |

### Architecture

`route -> service -> repository interface -> Postgres implementation`. `createApp(deps)` receives all dependencies (token service, clock, repositories),
so a test can replace any of them. Routes only translate HTTP; the business rules are in `services/` and `domain/`.

### Database versioning (Liquibase)

* Changelogs: `db/changelog/changes/NNN-*.sql`, listed **by hand** in `db.changelog-master.yaml` (a file that is not listed never runs).
* Never edit a changeset that already ran (Liquibase checks the checksum). Add a new file instead, and give it a `--rollback`.
* `context:dev` changesets are sample data for development, `context:e2e` bootstraps the commissioner/admin accounts of the e2e environment, tests run with the `test` context.

### CI

`.github/workflows/ci.yml` runs on every push: `unit` (typecheck + coverage gate) -> `integration` (migration rollback check + tests) -> `e2e`.
It calls the same npm scripts as above.

---

## 8. Troubleshooting

| Problem | What to do |
|---|---|
| `npm run test:integration` cannot connect | Start Docker Desktop. Check that port 5433 is free (`docker ps`). `npm run db:down` and try again. |
| Port 3000 / 5434 already in use during e2e | Stop whatever uses it, or run `npm run db:down` for leftovers of an earlier run. |
| Tests fail only after switching branches | Run `npm ci`, then `npm run db:reset:test`. |
| Liquibase says `Validation Failed ... check sum` | A changeset that already ran was edited. Undo the edit and add a new changeset file instead. |
| Windows line-ending warnings | The repository uses LF (`.gitattributes`). The warning is harmless. |
