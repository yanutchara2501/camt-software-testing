# 2.1 Unit test design - Election App

Branch: `election/unit-tests`. Code: `test/unit/election/`.

## 1. What is a "unit" in this app?

A unit is a piece of business logic that I can run **without a database, a network or the real clock**. The Express routes and the
`Pg*Repository` classes are *not* units: they only translate HTTP and SQL, so they are checked by component/integration tests
(see the test boundaries in the README).

| Unit | Responsibility (feature) | Collaborators -> how they are replaced |
|---|---|---|
| `AccountService.register` | A citizen registers as a voter | `UserRepository` (fake / stub / spy), `DistrictRepository` (stub), `TokenService` (dummy) |
| `AccountService.login` | A voter logs in and gets a token | `UserRepository` (fake), `TokenService` (mock) |
| `PollService.close` / `resultsFor` | A commissioner closes a district poll, then the score becomes public | district, candidate, vote repositories (fakes), `Clock` (stub) |
| `whyBallotIsClosed` | Can a voter vote right now? | none (pure function) |
| `isValidThaiNationalId` | Checksum of the Thai national id | none (pure function) |
| `ElectionAdminService` | Commissioner creates parties and candidates | repositories (fakes) |
| `hashPassword` / `verifyPassword`, `loadConfig`, `JwtTokenService` | helpers | env passed in, fake timers |

## 2. Techniques used to choose the cases

| Technique | Where I used it |
|---|---|
| **Equivalence partitioning** | National id: valid / wrong checksum / wrong length / not digits. Registration fields: valid / empty or blank. |
| **Boundary value analysis** | Password length: 7 (rejected) and 8 (accepted), `UT-A3a/b`. Opening time: just before (`08:59:59.999`) and exactly at (`09:00:00.000`) in `ballotRules.test.ts`. JWT lifetime: 59 s and 61 s. Candidate number: 0, -1, 1.5, NaN. |
| **Decision table** | `whyBallotIsClosed` (below) and `addCandidate` (number used? party used?) |
| **State transition** | The poll of a district: `OPEN -> close -> CLOSED`; `CLOSED -> close -> conflict`; scores visible only in `CLOSED` (`UT-C1`, `UT-C2`) |
| **Error guessing** | Login gives the same message for an unknown id and a wrong password, so nobody can find out which ids exist (`UT-B4`). |
| **Data-driven / property style** | Random but well-formed citizens must always be able to register (`UT-A7`, Faker). |

Decision table of `whyBallotIsClosed(now, electionOpensAt, districtClosedAt)`:

| Election exists? | `now >= opensAt`? | District closed? | Result | Test (`test/unit/ballotRules.test.ts`) |
|---|---|---|---|---|
| no | - | - | `election is not open` | "no election at all" |
| yes | no | no | `election is not open` | "before the opening time" |
| yes | no | yes | `election is not open` (first rule wins) | "both reasons apply" |
| yes | yes | no | `null` (allowed) | "while the election is open" / "exactly at the opening time" |
| yes | yes | yes | `poll is closed` | "once the district has been closed" |

## 3. Cases for the assignment suite (`test/unit/election/`)

| ID | Unit | Case | Kind | Assignment item | File |
|---|---|---|---|---|---|
| UT-A1 | register | Valid citizen of an existing district becomes a `VOTER`, text is trimmed | Happy path | 2.3.1 | `registration.test.ts` |
| UT-A2 | register | Wrong checksum -> `ValidationError`, nothing saved | Failure | 2.3.2 | `registration.test.ts` |
| UT-A3a / A3b | register | Password of 7 characters rejected, 8 accepted (boundary) | Failure / happy | 2.3.2 | `registration.test.ts` |
| UT-A4 | register | Already registered national id -> `ConflictError` (stubbed `findByNationalId`) | **Stub** | 2.3.3 | `registration.test.ts` |
| UT-A5 | register | Repository gets trimmed data and a password **hash** (`jest.spyOn` on a real fake) | **Spy** | 2.3.4 | `registration.test.ts` |
| UT-A7 | register | 8 random well-formed citizens (Faker seeds 1-8) can all register, their password verifies | **Faker** | 2.3.6 | `registration.test.ts` |
| UT-A8 | register | A random citizen with a broken national id is always rejected | Faker + failure | 2.3.2, 2.3.6 | `registration.test.ts` |
| UT-B1 | login | Right password -> the token of the token service | Happy path | 2.3.1 | `login.test.ts` |
| UT-B2 | login | Token service called once, with `{ userId, role, districtId }` of that voter | **Mock** | 2.3.5 | `login.test.ts` |
| UT-B3 | login | Wrong password -> `UnauthorizedError`, token service never called | Failure | 2.3.2 | `login.test.ts` |
| UT-B4 | login | Unknown id and wrong password give the same message | Failure | 2.3.2 | `login.test.ts` |
| UT-C1 | close / results | After closing, results show the vote count (random count 1-20 via Faker) | Happy path + Faker | 2.3.1, 2.3.6 | `pollClosing.test.ts` |
| UT-C2 | close | Closing twice -> `ConflictError`, first closing time is kept | Failure | 2.3.2 | `pollClosing.test.ts` |
| UT-C3 | close | Closing time = what the stubbed clock says | **Stub** | 2.3.3 | `pollClosing.test.ts` |
| UT-C4 | close | `DistrictRepository.close` called once with the district and the clock time | **Mock** | 2.3.5 | `pollClosing.test.ts` |

The earlier workshop tests (`test/unit/*.test.ts`, steps 02-04 and 06-07) cover the remaining units from the table in section 1.

## 4. Requirement checklist (assignment 2.3)

| Item | Done in |
|---|---|
| 2.3.1 One success (happy path) test case | UT-A1, UT-B1, UT-C1 |
| 2.3.2 One alternative / failure test case | UT-A2, UT-A3a, UT-B3, UT-C2 (and more) |
| 2.3.3 One stub implementation | UT-A4 (stubbed `UserRepository`), UT-C3 (stubbed clock), `districtsWithCm1` |
| 2.3.4 One spy implementation | UT-A5 (`jest.spyOn(users, 'create')`) |
| 2.3.5 One mock implementation | UT-B2 (`jest.fn` token service with call expectations), UT-C4 |
| 2.3.6 One test with Faker-generated data | UT-A7, UT-A8, UT-C1 |

## 5. How I told "stub", "spy" and "mock" apart in this suite

* **Stub** - a canned answer goes *in*; the test never asks how often it was called.
* **Spy** - the real thing keeps working and I look at what happened to it *afterwards* (`jest.spyOn`, `mock.calls`).
* **Mock** - I state the expected interaction first and the test is about that interaction (`toHaveBeenCalledTimes`, `toHaveBeenCalledWith`).

## 6. Run

```bash
npm run test:unit                              # everything, no Docker
npx jest --selectProjects unit test/unit/election --verbose
npm run test:coverage                          # with the coverage gate
```
