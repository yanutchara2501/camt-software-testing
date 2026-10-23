# Step 00 - Setup and first red/green

Branch: `step/00-setup`

## What I did

1. Installed the dependencies (`npm ci`) and checked Node 24, Docker and Git are available.
2. Ran the three kinds of test that exist in the starter project and wrote down how they feel.
3. Broke the checksum on purpose, watched the tests go red, and fixed it again.
4. Read the code that I am going to test (`app.ts`, `jest.config.js`, `voteRoutes.ts`).

## The three test levels I ran

| | unit | integration (component) | e2e |
|---|---|---|---|
| Command | `npm run test:unit` | `npm run test:integration` | `npm run test:e2e` |
| Time (my laptop) | ~2 s | ~20 s (starts Postgres + Liquibase first) | ~85 s the first time (building the app image dominates), the test itself ~1 s |
| Needs Docker? | No | Yes (Postgres on port 5433) | Yes (Postgres + the app image) |
| If it fails, how precisely do I know where? | Very precise, it points to one function | Medium, the problem is somewhere between the route and the database | Low, the whole system is one black box |

What I noticed: the more real parts a test uses, the slower it is, and the less exactly the failure message
tells me what is broken. This is the main reason to have many unit tests and only a few e2e tests.

## Red / green experiment

In `src/domain/thaiNationalId.ts` I changed the weight `(13 - i)` to `(12 - i)`.

* Unit test: **red**. 1 test failed (`accepts an id whose last digit matches the checksum`).
  The name of the test already tells me that the checksum calculation is wrong.
* Integration test: **red** too. `POST /auth/register` returned `400` instead of `201`.
  This one only says "registration failed", I have to dig to find out that the id validator is the cause.
* After I reverted the change both went back to green.

This is a nice small example of why a failing unit test is cheaper to debug than a failing component test.

## Questions from the lab

**Why are there two Jest projects (`unit` and `integration`)?**
They have different needs. Unit tests have no I/O so they can run in parallel and need no setup.
Integration tests share one real database so they run in band (one file at a time), and they need
`env.ts` to point at the test database. Separate projects let me run the fast ones alone.

**What does `createApp(deps)` take, and why?**
It receives the token service, the clock and all repositories. Because the dependencies are passed in
(dependency injection) a test can give the app a fake or a real one. This creates a *seam* where I can
replace a part of the system without changing the code.

**What is different in `voteRoutes.ts`?**
It is the only route file that imports a global `pool`, reads `process.env.JWT_SECRET` itself, and calls
`new Date()` directly. There is no seam, so it can only be tested through a real database and the real clock.
I will deal with it in step 07 (legacy code).

## Concepts used in this step

* **Test pyramid / test boundaries** - unit, component and end-to-end tests differ in cost and precision.
* **Red-green cycle** - a test is only trustworthy if I have seen it fail for the right reason.
* **Seam** - a place where behaviour can be changed without editing the code (here: constructor injection).
