# Step 08 - Apply everything to the project

Branch: `step/08-own-project`

> **My own project is ChaoJakk** (a marketplace for hiring construction machinery: Vue 3 + Express + Prisma + PostgreSQL).
> I applied this lab to it in a separate repository, on the branch `testing-workshop`. Everything from that work is copied into
> [`own-project/chaojakk/`](../../own-project/chaojakk/README.md) so it can be read here: the write-up (harness inventory, characterization
> of `parseId`, findings, readiness checklist 17 -> 18 of 24) and the four new test files.
> Those tests only run inside the ChaoJakk repository (they need its code and database), so they are not part of `npm test` here.
>
> Part 2 of the assignment (unit test design, V&V code comparison, stub/spy/mock/Faker tests) was also done on ChaoJakk, for the login and two-factor
> feature: [vv-unit-test-design.md](../../own-project/chaojakk/vv-unit-test-design.md). A summary in Thai of every technique used is in [summary-th.md](../summary-th.md).
>
> The rest of this page is the same lab done on the election backend of this repository, which is the application used in the
> earlier steps. It is kept as a worked example.

The project under test below is the election backend in this repository (Express + TypeScript + PostgreSQL + Liquibase).
The goal of this step is not "everything", it is **real tests that run with one command** and knowing the next step.

## Step 1 - Test harness

The harness was built step by step in the earlier branches, so here I only check that it is complete:

| Needed | Where it is | Built in |
|---|---|---|
| `unit` and `integration` Jest projects | `jest.config.js` | starter + step 04 |
| Test DB from versioned migrations | `docker-compose.yml`, `db/` (Liquibase) | starter, step 04, 06 |
| Test environment and cleanup | `test/integration/env.ts`, `support/database.ts` (`truncateAll`) | starter, step 06 |
| `createApp()` separate from `listen()` (the first seam) | `src/app.ts` and `src/server.ts` | starter |
| Test data | `test/support/builders.ts`, `test/integration/support/given.ts` | step 04 |
| One command for everything | `npm run test:all` (unit + integration + e2e) | this step |

## Step 2 - Characterize the most important endpoint first

The most important endpoint is **voting** (`PUT /me/vote`), and it was the least tested. Its characterization tests, including the
strange behaviours I found, are in step 07 (`test/integration/vote.characterization.test.ts`).

## Step 3 - Automate the prepared test cases

All twelve cases of [`test-cases.md`](test-cases.md) are automated. The file has a traceability table from every case to the test that checks it.
Two examples for the two levels that the lab asks for:

* **Unit**: TC-03 "wrong checksum is rejected, nothing is saved" is in `test/unit/accountService.test.ts`. The checksum rule is a pure function
  and the service is tested with a stubbed `DistrictRepository` and a spied `UserRepository`.
  The logic of the vote route was too deep inside the handler to be a unit test, so I **sprouted** the rule into `src/domain/ballotRules.ts` (step 07).
* **Component**: TC-09 "a voter cannot create a party" is in `test/integration/elections.test.ts` with supertest, a real Postgres and data from builders.

## Step 4 - Readiness checklist, round 2

See [`checklist.md`](checklist.md): **12 -> 23 of 24**. The only missing point is item 6 (CI), because the workflow has not run on GitHub yet.
Biggest jumps: builders (0->2), test doubles used at the right level (0->2), characterization tests (0->2).
What I would do first after this: push the repository and watch the pipeline, then move the vote logic out of the route into a `VoteService`.

## Questions that helped me when I was stuck

* *What must I control to test this?* (time, DB, token, outside services) - each answer is a seam. Time -> `Clock`, DB -> repository interfaces, token -> `TokenService`.
* *Does this test need a real database, or can the logic be separated?* - this is why the ballot rules were sprouted into a pure function.
* *If this test goes red, will I know what broke?* - this is why the unit tests have names that read like requirements.

## Concepts used in this step

* **Test harness / seams** as the first thing to build in a project that has no tests
* **Characterize before changing**
* **Traceability** between test cases and automated tests
* **Self assessment** with a checklist to choose the next improvement
