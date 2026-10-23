# Step 03 - Test doubles

Branch: `step/03-test-doubles`

## Idea

A *test double* replaces a real collaborator so that a unit test does not need a database or the real clock.
There are five kinds. They differ in **what I use them for**, not in how they are built
(`jest.fn()` can be any of the first four).

| Double | What it is for | Example in my tests |
|---|---|---|
| Dummy | Has to be passed in, but must never be used | `dummyTokens` in `accountService.test.ts`. It *throws* if called, so an accidental use fails the test. |
| Stub | Feeds a canned answer in (indirect **input**) | `stubDistricts(true)` always answers "district CM-1 exists". |
| Spy | Records what was sent to it (indirect **output**), I check it afterwards | `users.create.mock.calls[0][0]` shows the `passwordHash` that the service tried to save. |
| Mock | Has an expectation about how it must be called, and the test verifies it | `expect(issue).toHaveBeenCalledWith({ userId: 42, role: 'VOTER', districtId: 'CM-1' })` and `expect(create).not.toHaveBeenCalled()` |
| Fake | A real, working but simpler implementation | `InMemoryUserRepository`, `InMemoryPartyRepository`, ... in `test/support/inMemoryRepositories.ts` |

This works because `AccountService` and `ElectionAdminService` get their repositories and the token service
through the **constructor** as interfaces. The constructor is the *seam* where I plug the double in.

## What I wrote

| File | Doubles used |
|---|---|
| `test/unit/accountService.test.ts` | dummy, stub, spy, mock and fake. Each use has a comment saying which kind it is and why. |
| `test/unit/electionAdminService.test.ts` | fakes only (in-memory repositories) |
| `test/unit/jwtTokenService.test.ts` | Jest fake timers (the clock as a dependency) |
| `test/support/inMemoryRepositories.ts` | the four fake repositories |

## Questions from the lab

**When should I use a fake instead of `jest.fn()`?**
When the answer of a collaborator changes while the test runs. In `addCandidate` the service calls
`findByDistrict`, then I add a candidate, then it must return a longer list. With `jest.fn()` I would have to script
every answer in order (`mockResolvedValueOnce` ...) and the test would copy the implementation. A fake just behaves
like a small database.

**How do I know a fake is not lying?**
It must follow the same rules as the real repository (for example candidates sorted by number). A *contract
test* that runs the same cases against the fake and the Pg repository proves it. I do this in step 04.

**Fake timers vs. an injected `Clock`.**
An injected `Clock` (`src/clock.ts`) is the better design for my own code: no magic, any test can pass a fixed clock.
Fake timers patch the global `Date`, so they are the tool for code I cannot change, such as the `jsonwebtoken`
library which reads the system time itself. That is why `JwtTokenService` is tested with
`jest.useFakeTimers` + `jest.setSystemTime`. I restore real timers in `afterEach`.

**Which of my tests are fragile?**
The ones that check `toHaveBeenCalledWith` on a mock are tied to the implementation. If I rename the way the
service calls the repository, they break even if the behaviour is the same. So I only use mocks where the *call itself*
is the behaviour (issuing a token, "never save when invalid"). For everything else I check the result or the state
of a fake.

**Should I mock `pg.Pool` directly?**
No, "do not mock what you do not own". The `Pool` API is not mine and a mock of it only proves that I called
the API the way I imagined. The repository *interface* is mine, so it is the right place for a double, and the real
SQL is then tested against a real database (integration test).

## Concepts used in this step

* **Test doubles** (Meszaros): dummy, stub, spy, mock, fake
* **State verification vs. behaviour verification** (fake/result vs. mock/call)
* **Dependency injection and seams**
* **Time as a dependency**: fake timers vs. injected clock
* **Do not mock what you do not own**
