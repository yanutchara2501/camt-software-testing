# Step 01 - Test boundaries

Branch: `step/01-boundaries`

## Idea

A test boundary tells me **how much of the system a test touches**. The lower the boundary, the cheaper and
more precise the test is. The question I asked for every case was:

> If this test goes red, how exactly do I know what broke, and how much do I pay (time, fragility) to find out?

| Boundary | What it checks | Where it lives in this repo |
|---|---|---|
| Unit | One small piece of logic. Collaborators are doubles (solitary) or real objects without I/O (sociable) | `test/unit/` |
| Integration | My code talks to something external correctly (a gateway, e.g. `PgUserRepository` + Postgres) | `test/integration/` (repository tests) |
| Component | The whole service in one process through its public interface (HTTP), external things are real or doubles | `test/integration/` (supertest + Postgres) |
| Contract | The consumer (frontend) and provider (API) agree on the shape of the data | not automated here, only discussed |
| End-to-end | The whole deployed system through a user journey | `e2e/` (Playwright against the app container) |

## Part A - Sorting the 16 reference cases

I chose the **lowest boundary that still gives enough confidence**.

| # | Case | Boundary | Why |
|---|---|---|---|
| 1 | National id with a wrong checksum is rejected | Unit | Pure function, no I/O. Every edge case can be tested cheaply. |
| 2 | Unknown district on registration gives 400 | Unit (+1 Component) | The rule is in `AccountService`, so unit with a stubbed `DistrictRepository`. One component test only to prove that `ValidationError` becomes HTTP 400. |
| 3 | `PgUserRepository.findByNationalId` maps columns correctly | Integration | The thing that can go wrong is the SQL and the mapping to the real schema. A mocked DB would prove nothing. |
| 4 | VOTER calls `POST /parties` and gets 403 | Component | It is about middleware and route wiring, so it needs HTTP but not the whole system. |
| 5 | Register, login, vote, change vote, close, check results | End-to-end | The value is that every part works together. I only need a few of these. |
| 6 | Password is stored as a hash | Unit | Spy on `UserRepository.create` and check that the stored value is not the plain password. |
| 7 | Candidate number cannot repeat in a district | Unit (+Integration) | The rule is in `ElectionAdminService`. The `UNIQUE` constraint in the DB is the last line of defence against a race, so it could get an integration test. |
| 8 | All Liquibase changelogs apply to an empty DB | Integration (pipeline) | No separate test needed, `npm run test:integration` already migrates a fresh DB every time. |
| 9 | Results hide the scores before the poll closes | Unit (+Component) | The hide/show rule is unit logic, one component test confirms the JSON shape. |
| 10 | Frontend expects `closed` and `candidates[].votes` | Contract | Consumer-driven contract (for example Pact) catches a breaking change without running e2e. |
| 11 | Expired JWT cannot authenticate | Unit | `JwtTokenService` with fake timers, no need to wait for one hour. |
| 12 | Admin makes a user a commissioner, who can then create a party | Component | Two HTTP calls with a real DB inside one process. |
| 13 | 1,000 concurrent votes in the first minute | Not a functional test | Load/performance test (k6, JMeter, Gatling). |
| 14 | A voter only sees candidates of their own district | Component | The rule is inside the SQL of the legacy route, so it needs HTTP + DB. After refactoring it could be a unit test. |
| 15 | Party page looks good on a mobile phone | Not a functional test | Manual / exploratory testing or visual regression screenshots. |
| 16 | A voter cannot change the vote after the poll is closed | Component, then Unit | Today it needs a characterization test through HTTP because the handler is legacy. After sprouting the rule (step 07) it becomes a unit test. |

Two things I learned from this table:

* **Cases 14 and 16** show that the lowest possible boundary depends on the *design of the code*, not only on the
  requirement. Code without a seam forces me to test at a high, slow, fragile level.
* **Cases 2, 7, 9** show the pattern "rule at unit level + one component test for the wiring". I do not have to test
  every edge case through HTTP.

## Part B - My own test cases

My cases, with the boundary of each one, are in [`test-cases.md`](test-cases.md).
The suite shape is a pyramid (7 unit, 4 component, 1 e2e), which is what I want.

If I had to move the e2e case (TC-12) lower, I would test each hop at component level
(login -> vote -> close -> results as separate supertest calls). That needs the poll-closing feature to be
reachable through `createApp` with injected dependencies (done in step 06).

## Part C - Readiness checklist, round 1

See [`checklist.md`](checklist.md). Round 1 score for this repository at the start: **12 / 24**.

## Concepts used in this step

* **Test pyramid** (Fowler / Clemson, *Testing Strategies in a Microservice Architecture*)
* **Solitary vs. sociable unit tests**
* **Test boundary selection** - lowest level that gives enough confidence
* **Non-functional testing** (performance) and **contract testing** are outside the functional pyramid
