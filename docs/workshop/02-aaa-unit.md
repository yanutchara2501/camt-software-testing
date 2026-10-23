# Step 02 - Arrange / Act / Assert and test smells

Branch: `step/02-aaa-unit`

## Idea

A good unit test follows the **four-phase test** from *xUnit Test Patterns*. I use the short form:

```ts
it('rejects an id whose checksum digit is wrong', () => {
  const id = '1509900000018';          // Arrange - prepare what I need
  const valid = isValidThaiNationalId(id);   // Act - do the one thing under test
  expect(valid).toBe(false);           // Assert - check the result of that Act
});
```

My rules:

* One test = one behaviour. The test name should read like a sentence of the specification.
* One Act. Two Acts means two tests are hiding in one.
* No logic (`for`, `if`) in a test. Use `it.each` for tables of examples.
* When the test is red, the test name and the message must be enough to know what broke without opening the file.

## Part A - The smelly test (first commit of this branch)

I added the given `smelly.test.ts` first. It is green, but it is bad:

| Smell | Where | What hurts when it fails |
|---|---|---|
| Obscure Test | names `stuff / works / hash` | The name says nothing about the behaviour. |
| Eager Test | one `it` checks ids, hashing and config | The first failing line hides everything after it. |
| Assertion Roulette | many `expect` with no message | I cannot tell which of 15 assertions failed. |
| Conditional Test Logic | `for` loop and `if (h === h2) throw` | The test itself can have bugs. |
| Test without assertion | `it('hash', ...)` only calls `hashPassword('x')` | It can never fail for a wrong reason, so it protects nothing. |

Experiment: I made `hashPassword` return the plain password. The result was only
`stuff > works` with `Expected: not "voter1234"`. I had to open the file and count lines to find which check was
meant. That is what "not enough information in the failure" feels like.

## Part B - Refactor

I deleted the smelly file and wrote tests per unit under test:

| File | What it covers |
|---|---|
| `thaiNationalId.test.ts` | valid ids with `it.each`, wrong checksum, malformed ids (empty, short, long, letters, spaces) |
| `passwords.test.ts` | hash is not plain text, format is `scrypt$salt$hash`, same password hashes differently (salt), verify right/wrong, broken stored hash returns `false` and does not throw |
| `config.test.ts` | defaults when env is empty, reads `PORT`, `JWT_SECRET`, `DATABASE_URL` from the env that I pass in |
| `toPublicUser.test.ts` | (stretch) `passwordHash` never leaks, other fields stay |

The same mutation as before (hash returns plain text) now gives several red tests with names such as
`hashPassword does not return the plain-text password` and `... uses the scrypt$salt$hash format`.
I can read the failure like a bug report.

**Why is `loadConfig(env)` easy to test?** It receives `env` as a parameter. A test just passes
`{ PORT: '8080' }`. If it read `process.env` directly I would have to change global state and put it back after
every test, and parallel tests could disturb each other.

## Concepts used in this step

* **Four-phase test / Arrange-Act-Assert**
* **Test smells**: Obscure Test, Eager Test, Assertion Roulette, Conditional Test Logic, Test without assertion
* **Data-driven tests** with `it.each` (a table of examples instead of a loop)
* **Equivalence partitioning** for the national id (valid / wrong checksum / wrong length / wrong characters)
* **Dependency as a parameter** (`loadConfig(env)`) for testability
