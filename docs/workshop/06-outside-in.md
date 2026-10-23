# Step 06 - Outside-in development (acceptance test -> component -> unit)

Branch: `step/06-outside-in`

## The feature

> As a commissioner I want to close the poll of a district, so that the public can see the score of that district.

1. `POST /districts/:id/close` (commissioner) -> `200 { districtId, closedAt }`
2. Before closing, `GET /districts/:id/results` -> `closed: false` and **no** scores
3. After closing -> `closed: true`, `closedAt` and every candidate has `votes` (0 if nobody chose them)
4. Closing again -> `409`, a voter trying to close -> `403`, unknown district -> `404`

## Idea: the double loop (Freeman & Pryce, *Growing Object-Oriented Software, Guided by Tests*)

```
outer loop: acceptance test (Playwright, whole system)        red ...................... green
  inner loop: component test (supertest + Postgres)             red ........ green
    inner-inner loop: unit test (service with doubles)            red .. green
```

I started from the **outside** with a test that describes the feature, and let each smaller test tell me what to build next.
Each commit on this branch is one move of that loop:

| Commit | State |
|---|---|
| acceptance test `e2e/close-poll.spec.ts` | **red** for the right reason: `POST /districts/CM-3/close` gives `404` (the route does not exist), while the setup (login, parties, candidates, three votes) works |
| component test `poll.test.ts` + unit test `pollService.test.ts` | red: no service, no repository methods, no column |
| implementation | all green: unit 88, integration 36, e2e 2 |

### What each level taught me

* **Acceptance test** (walking skeleton): runs through the real container, Postgres, Liquibase and HTTP. It tells me when the *feature* works.
  `e2e/support/electionApi.ts` is a small driver, so the test reads like the story (`api.voteFor(voter, 1)`).
* **Component test**: designs the HTTP contract (status codes, JSON) and found a problem early: `closedAt` must be comparable,
  so I injected a **fixed `Clock`** through `pgDeps(pool, tokens, { clock })`.
* **Unit test of `PollService`**: while writing it with doubles I *discovered* what the service needs from the outside world:
  a `Clock`, `DistrictRepository.close/closedAt`, and a new `VoteRepository.countByCandidate`. The test setup told me about the design
  ("listen to the tests"). I did not have to decide the interfaces up front.

### Production code that came out of it

| Piece | Note |
|---|---|
| `db/changelog/changes/005-district-poll-closing.sql` | adds `districts.closed_at`, has a `--rollback`, and is listed in the master changelog **after** the `day1` tag and before the seeds |
| `PgDistrictRepository.close` | one `UPDATE ... WHERE closed_at IS NULL`, so two commissioners cannot both close the same poll (the race is solved in the database, not in JavaScript) |
| `PgVoteRepository.countByCandidate` | the only place that knows SQL returns `COUNT(*)` as a string |
| `PollService` | the rule "hide scores until closed" lives here. When the poll is open the votes are **not even read** (there is a spy test for it) |
| `electionRoutes.ts` | the route only calls the service, the old inline code that built the results was removed (refactor step) |

Test support grew too: `InMemoryDistrictRepository` / `InMemoryVoteRepository` fakes, `given.vote()` and `truncateAll` that also resets
`closed_at`. A contract test (`districtRepository.contract.test.ts`) runs the same closing expectations against the fake and Postgres.

## Questions from the lab

**Which level helped me design most, and which level confirmed the wiring?**
The unit test of the service helped design (it showed the needed collaborators). The acceptance and component tests confirmed that everything is
connected (route -> service -> SQL -> column). A unit test alone would have been green even if I forgot the migration.

**Inside-out instead?** Starting from the table, then repository, service, route, I would build things I *guess* are needed. The risk
is building a wrong or unused layer and finding that out only when the route is written at the end.

**How slow is one acceptance test?** About 1-2 seconds for the test itself (plus ~1 minute to build and start the stack the first time), while
the whole unit suite runs in a few seconds. That is why I want only a few acceptance tests (one per important journey) and many unit tests.

## Concepts used in this step

* **Outside-in / double-loop TDD**, walking skeleton
* **Red for the right reason**
* **"Listen to the tests"** - test difficulty reveals design needs
* **Injected clock** for deterministic time
* **Schema change with Liquibase** (rollback + master list)
* **Contract test** for fakes
