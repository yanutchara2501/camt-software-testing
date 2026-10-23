# 2.2 Code comparison - original code vs. code improved with V&V

| Branch | What it holds |
|---|---|
| `election/original` | The election backend exactly as it was before I did any V&V work: the first commit of this repository (`6419ebd`). Nothing was changed. |
| `election/vv-improved` | The same application after applying Verification and Validation, with tests for every change. |

Compare them yourself with:

```bash
git diff election/original election/vv-improved --stat -- src db
git diff election/original election/vv-improved -- src/routes/voteRoutes.ts
```

> Note on the baseline: `election/original` is the code that this assignment started from (the reference election backend). If the Backend course
> submission has to be the baseline, put that code on the `election/original` branch and re-run the same comparison; the method below does not change.

## V&V in one paragraph

* **Verification** asks "are we building the product *right*?": does the code do what its own rules say, without defects?
  I used code review, characterization tests (they pin down what the code does today) and tests that try to break it.
* **Validation** asks "are we building the *right* product?": does the system do what voters and commissioners need?
  I checked the user story "a commissioner closes a district poll, then the public sees the score, and nobody can vote after that".

## What stayed the same

| Part | Why it was left alone |
|---|---|
| `src/auth/*` (password hashing, `TokenService`, middleware) | Verified by unit tests (step 02, 03). Hashing uses scrypt with a salt, tokens are checked in one place. No defect found. |
| `src/domain/thaiNationalId.ts`, `types.ts`, `errors.ts`, `config.ts`, `clock.ts` | Small pure code with 100% unit coverage. |
| `AccountService`, `ElectionAdminService`, user / party repositories, account routes | Behaviour is correct and now has unit and component tests. Rewriting working code only adds risk. |
| Database schema `001`-`004`, seeds, `db/Dockerfile` | A Liquibase changeset that already ran must never be edited. Changes are new files only. |
| `src/server.ts`, `src/db.ts` | Only wiring. |
| Public API of the old endpoints (paths, JSON shape, status codes) | Proven by the characterization tests of the vote routes: after the rewrite everything stayed green except the two behaviours that I changed on purpose (change 3 and the Bearer prefix in change 5). |
| The log line `[vote] voter X voted for Y at ...` | Somebody may read the log, so the text was kept. |

## What changed, and why

| # | Change | V or V | Rationale | Evidence |
|---|---|---|---|---|
| 1 | New endpoint `POST /districts/:id/close`, `closed_at` column (migration `005`), `PollService`, `PgDistrictRepository.close/closedAt`, `PgVoteRepository.countByCandidate` | Validation | The first version could never close a poll, so scores could never be shown. The user story needs it. The score is hidden until the poll is closed; closing twice is a conflict. | e2e `close-poll.spec.ts`, `poll.test.ts`, `pollService.test.ts` |
| 2 | Voting and changing a vote are refused after the district is closed (`409 poll is closed`), rule in `domain/ballotRules.ts` | Validation | Without it a voter could change the vote after the result was published, which breaks the meaning of "closing". | `ballotRules.test.ts`, characterization tests, e2e stretch step |
| 3 | `candidateId: "abc"` (also `1.5`, `-3`, `true`, `[1]`) gives `400 candidateId must be a positive integer` | Verification | **Defect.** The bad value went to PostgreSQL, which raised an error, and the user saw `500 internal server error`. Bad input from a client must never look like a server fault. | characterization test (was 500, now 400), `voteService.test.ts` VT-11/12/13 |
| 4 | Casting a vote is **one atomic SQL statement** (`INSERT ... ON CONFLICT DO UPDATE`) instead of `SELECT` then `INSERT` or `UPDATE` | Verification | **Defect (race condition).** Two requests of the same voter at the same moment both saw "no vote yet" and the second `INSERT` crashed with a primary-key error (500). | `voteRepository.contract.test.ts`: 10 simultaneous votes. Against the old logic it failed 3 out of 3 runs with `duplicate key value violates unique constraint "votes_pkey"`; against the new code it passes. |
| 5 | The vote routes use the shared `TokenService` and `authenticate()` instead of `jwt.verify(..., process.env.JWT_SECRET \|\| 'dev-secret')` | Verification | **Security smell.** The old route had its own hard-coded fallback secret. If `JWT_SECRET` were missing in production, this route would accept tokens signed with the well-known string `dev-secret`, while the rest of the app used the configured secret. Now there is one place that knows the secret. A token without the `Bearer ` prefix is no longer accepted (the other routes never accepted it). | characterization test updated on purpose (step 07) |
| 6 | Logic moved from the route into `VoteService`, SQL into `PgVoteRepository` / `PgElectionRepository`, raw `pool` removed from `AppDeps` | Verification (maintainability, testability) | The old route mixed HTTP, business rules, SQL, time and logging in one 86-line file, so the rules could only be tested through a database. Now `voteRoutes.ts` only maps HTTP, and the rules have their own unit tests with fakes. | `voteService.test.ts` |
| 7 | `new Date()` replaced by the injected `Clock` in the vote and poll rules | Verification (testability) | Time was hidden inside the handler, so a test could not control it. | fixed clock in unit and component tests |
| 8 | `==` / `!=` changed to `===` / `!==`, `any` removed | Verification | Loose equality compares `"1"` with `1` silently; types make a wrong field name a compile error. | `npm run typecheck` |

### Size of the change

```
12 files in src/ and db/ changed: 329 insertions, 104 deletions
5 new source files in src/, 1 new migration, voteRoutes.ts shrank from 86 lines to 26
```

## Weird behaviours that I deliberately did NOT change

| Behaviour | Why it was left |
|---|---|
| `candidateId: "1"` (a string of digits) is accepted | A client may already send strings. It is accepted and converted, and it has a test (VT-3). |
| `candidateId: 0` or `""` answers `400 candidateId is required` | Same answer as before. |
| Voting by a `COMMISSIONER` or `ADMIN` is refused with `403 only voters can vote` | Same as before; it is the correct rule. |

## Result

| | original | improved |
|---|---|---|
| Unit tests | 6 | 154 |
| Component / integration tests | 1 | 71 |
| End-to-end tests | 1 | 2 |
| Unit coverage of `src/services` | - | 98% statements (gate: 90%) |
| Known defects in the vote path | 3 (500 on bad input, race condition, hard-coded secret fallback) | 0 known |
| Features of the user story | register, login, vote | + close poll, + publish score, + stop voting after close |
