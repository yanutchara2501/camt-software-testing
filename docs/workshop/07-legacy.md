# Step 07 - Legacy code: no voting after the poll is closed

Branch: `step/07-legacy`

> "Legacy code is simply code without tests." - Michael Feathers, *Working Effectively with Legacy Code*

## The new requirement

After a commissioner closes the poll of a district, voters of that district can **not vote or change their vote any more**:
`409 { error: 'poll is closed' }`.

The code to change is `src/routes/voteRoutes.ts`. At the start it had no tests, used a global `pool`, read `process.env.JWT_SECRET` and called `new Date()` directly.

## Feathers' legacy code change algorithm (what I followed)

1. **Find the change point** - the check "election must be open" inside `PUT /me/vote`.
2. **Find the test point** - the HTTP response of `PUT /me/vote` and the rows in the `votes` table (component test through supertest).
3. **Break the dependencies** - so that the code can live in a test harness.
4. **Write characterization tests** - before touching the behaviour.
5. **Make the change and refactor.**

## Part A - Characterization tests (first commit)

`test/integration/vote.characterization.test.ts` records what the route **does**, not what it should do. Method: write what I expect,
run it, and if the system answers differently, change the assertion to the real answer. Strange results stay in the test, marked `WEIRD`,
and are **not fixed** in this branch.

What I found:

| Input | Behaviour today |
|---|---|
| first vote / changing the vote | `201 changed:false` / `200 changed:true`, always exactly one row per voter |
| no token or garbage token | `401 authentication required` |
| commissioner votes | `403 only voters can vote` |
| `candidateId` missing | `400 candidateId is required` |
| before opening time, or no election row | `409 election is not open` |
| unknown candidate / candidate of another district | `404` / `403` |
| WEIRD `candidateId: 0` | `400` (because `!0` is true) |
| WEIRD `candidateId: "1"` | works, answer returns the number `1` |
| WEIRD `candidateId: "abc"` | goes to the database and ends as **500** instead of 400 |
| WEIRD token without `Bearer ` prefix | accepted |
| a log line `[vote] voter X voted for Y at ...` | written with `console.log` (somebody may rely on it, so a test pins it) |

I checked that the tests can fail: changing the text `only voters can vote` made exactly one test red.

## Part B - Break the dependencies, one small step at a time

I ran the characterization tests after every step.

| # | Step (Feathers' technique) | Result |
|---|---|---|
| 1 | **Parameterize Constructor**: `export default router` -> `voteRoutes({ pool })`, and `pool` added to `AppDeps` | still 54/54 green. A temporary debt: the raw pool is in `AppDeps` until the route gets a repository. |
| 2 | Use `authenticate(tokens)` instead of `jwt.verify(..., process.env.JWT_SECRET)` | **one test went red**: the "token without Bearer" quirk. All the error messages stayed the same. |
| 3 | `new Date()` -> `clock.now()` (the clock is injected) | the tests can use a fixed clock, so they no longer depend on the real time. |

**About the red test in step 2.** This is exactly what characterization tests are for: they tell me when behaviour changes. I had to decide:
keep the quirk or drop it. All other routes already require `Bearer`, and no document says that raw tokens are allowed, so I **changed it on purpose**,
updated the test and its name, and left a comment in the test and in the commit message. A characterization test is not holy:
when I change behaviour deliberately the test must change with it, and the change must be visible in the history.

After step 3 the line `legacyPool.end()` in the test is not needed any more, because the route does not create a second global pool.

(Jest also has *module seams* such as `jest.mock('../../src/db')` and fake timers, which would avoid touching the code. I did not use them:
those tests would depend on the file structure and not on behaviour.)

## Part C - Sprout

I did not add more `if`s into the middle of a long handler. I wrote the new rule as a separate, pure function (**Sprout Method / Sprout Class**)
and called it from the legacy code in one place:

```ts
// src/domain/ballotRules.ts
whyBallotIsClosed({ now, electionOpensAt, districtClosedAt }): string | null
```

* `test/unit/ballotRules.test.ts` covers the old rules (no election, before opening, exactly at opening time) and the new rule (closed, closed later forever,
  and "election is not open" wins when both are true because that check was first before).
* The handler now asks the database for `election.opens_at` and `districts.closed_at` and gives them to the function. The old inline `if` was removed.
* New characterization tests: first vote after close = 409, changing a vote after close = 409 **and the old vote stays**, voters of another district are not affected.
* Stretch: the e2e acceptance test from step 06 got a last step: after closing, the voter tries to vote again and gets `409`.

Result: unit 95, integration 57, e2e 2, all green.

## Discussion

**Characterization test vs. a test written from a requirement?**
A requirement test says what the system *should* do. A characterization test says what it *does now*, including the strange parts, so that I can change code safely.
I delete or change a characterization test when I decide the old behaviour was wrong (like the Bearer case), or when the code is covered by real requirement tests.

**Fix the strange behaviours in this change? (for example `"abc"` giving 500)**
Not in this branch. The task was the new requirement. Mixing bug fixes into it makes the change harder to review, and somebody may depend on the old behaviour.
They are recorded as `WEIRD` tests so that they become a visible list of future work. (I fix some of them in the V&V branch, with the reason.)

**Next step for `voteRoutes.ts`?**
Give it a `VoteRepository` method for writing votes, move the logic into a `VoteService` (like `PollService`) and remove the raw `pool` from `AppDeps`.
The logic would then be unit tested with doubles, and the route would only translate HTTP.

## Concepts used in this step

* **Legacy code change algorithm**, **characterization tests**, **seams**
* **Parameterize Constructor**, **Sprout Method / Class**
* **Test point vs. change point**
* **Deliberate behaviour change** under a characterization test
