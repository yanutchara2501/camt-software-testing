# My test cases for the election system

These are the test cases I prepared in Lab 00 (step 5) and sorted by boundary in Lab 01.
The IDs are used again in the later branches, so the tests can be traced back to a case.

| ID | Given | When | Then | Boundary | Test double needed | Test data needed |
|---|---|---|---|---|---|---|
| TC-01 | A voter in district CM-1 who has not voted yet | The voter votes for candidate number 2 of CM-1 | The vote is saved and `GET /me/candidates` shows number 2 as selected | Component | none (real DB) | district CM-1, 2 parties, 2 candidates, 1 voter |
| TC-02 | A registration with a valid national id and a strong password | `AccountService.register` is called | A public user is returned and it has no `passwordHash` | Unit | stub `DistrictRepository`, spy `UserRepository` | valid national id |
| TC-03 | A registration whose national id has a wrong checksum digit | `register` is called | `ValidationError` ("invalid national id") | Unit | none | invalid id `1509900000018` |
| TC-04 | A national id that is already registered | `register` is called with the same id | `ConflictError` | Unit | stub `UserRepository.findByNationalId` | existing user |
| TC-05 | A registered voter | The voter logs in with the wrong password | `UnauthorizedError`, and no token is issued | Unit | mock `TokenService` (must not be called) | stored user with a real hash |
| TC-06 | A commissioner and a party that already exists | The commissioner creates a party with the same name | `ConflictError` (409) | Unit | fake `PartyRepository` | party "Alpha" |
| TC-07 | District CM-1 already has candidate number 1 | A commissioner adds another candidate with number 1 | `ConflictError` (409) | Unit | fake repositories | 1 existing candidate |
| TC-08 | The election has not opened yet | A voter calls `PUT /me/vote` | 409 "election is not open" | Component | none (real DB) | election row with `opens_at` in the future |
| TC-09 | A voter token | The voter calls `POST /parties` | 403 | Component | none | voter token |
| TC-10 | A district with votes cast, poll still open | Anyone calls `GET /districts/:id/results` | `closed: false` and no vote counts in the body | Component | none | candidates + votes |
| TC-11 | A JWT that has expired | The token is verified | `null` (not authenticated) | Unit | fake timers | token with 60 s lifetime |
| TC-12 | Register, login, vote, change vote, commissioner closes the poll | The public results are read | Counts are correct for every candidate | End-to-end | none | full journey |

## Boundary count

```
        /\         e2e         : 1
       /  \        component   : 4
      /    \       integration : 0 (repository tests come in Lab 04)
     /______\      unit        : 7
```

The shape is close to a pyramid. The only e2e case (TC-12) is the one that proves
that all parts are wired together, the rest can be checked at a lower level.

## Where each case is automated (traceability)

| ID | Automated in |
|---|---|
| TC-01 | `test/integration/vote.characterization.test.ts` (records the first vote; marks the chosen candidate in `GET /me/candidates`) |
| TC-02 | `test/unit/accountService.test.ts` (registers a voter; does not return the password hash) |
| TC-03 | `test/unit/accountService.test.ts` (does not save anything when the national id is invalid) |
| TC-04 | `test/unit/accountService.test.ts` (rejects a national id that is already registered) |
| TC-05 | `test/unit/accountService.test.ts` (rejects a wrong password without issuing a token) |
| TC-06 | `test/unit/electionAdminService.test.ts` (rejects a party name that already exists) |
| TC-07 | `test/unit/electionAdminService.test.ts` (rejects a candidate number already used in the district) |
| TC-08 | `test/integration/vote.characterization.test.ts` (409 "election is not open") |
| TC-09 | `test/integration/elections.test.ts` (`POST /parties` answers 403 to a voter) |
| TC-10 | `test/integration/poll.test.ts` and `test/unit/pollService.test.ts` (no scores while the poll is open) |
| TC-11 | `test/unit/jwtTokenService.test.ts` (rejects the token 61 seconds after it was issued) |
| TC-12 | `e2e/close-poll.spec.ts` |
