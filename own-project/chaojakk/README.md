# Testing workshop - applying it to ChaoJakk (Lab 08)

Short Thai summary of everything in this folder (Lab 08 and part 2): [report/summary-chaojakk.pdf](report/summary-chaojakk.pdf).

Branch: `testing-workshop` (cut from `origin/main`, made with `new-worktree.ps1`).
The branch only **adds** files: four test files and this note. No source file was changed.

The goal of this lab is not "everything". It is real tests that run with one command, and knowing the next step.

## Step 1 - Test harness: what was already there

ChaoJakk did not need a harness built. This is what exists (counted on this branch):

| Needed | Where it is |
|---|---|
| Separate unit and component tests | `platform/api/tests/unit` (88 files) and `platform/api/tests/feature` (135 files) |
| A real database for component tests, built from versioned migrations | `tests/globalSetup.ts` runs `prisma migrate deploy` on `TEST_DATABASE_URL` (the suite refuses to start if it is missing) |
| Clean data between test files | `tests/helpers/database.ts` (`resetDatabase`), `fileParallelism: false` in `vitest.config.ts` |
| An app without `listen()` (the first seam) | `createApp()` in `src/app.ts`, used with supertest |
| Test data creation | `tests/helpers/factories.ts` (`makeUser`, `makeListing`, `makeProvider`, ...) |
| End-to-end tests | Playwright in `platform/frontend` (`npm run test:e2e`, `test:core`, `test:fullstack`) |
| CI | `.github/workflows/ci.yml`: Postgres service, typecheck, tests, build |

How to run the backend tests: from `platform/api`, `npm test` (needs the test database from `.env` / `TEST_DATABASE_URL`).

## Step 2 - Characterize first

The most important endpoints (booking, payment, chat) already have a lot of feature tests, so I did not pile more on them.
I characterized something that **every** `:id` route shares and that had no direct test: `parseId` in `src/lib/params.ts`.
`tests/unit/params.test.ts` records what it does today. Strange answers are marked `WEIRD` and are not fixed:

| Input | Today |
|---|---|
| `"42"`, `42` | `42n` |
| `0`, `-1`, `1.5`, `"abc"`, `""`, `null`, `undefined`, `NaN`, `"Infinity"` | 404 "not found" |
| WEIRD `"1e3"` | accepted as `1000n` |
| WEIRD `"0x10"` | accepted as `16n` |
| WEIRD `" 7 "` | accepted as `7n` |
| WEIRD `"9007199254740993"` | becomes `9007199254740992n` (precision is lost above 2^53) |

None of these is dangerous today (the id then simply does not exist, or exists as a different row the caller could have asked for anyway),
but `parseId`'s own comment promises that a malformed id looks like a missing one, and the last row shows a malformed id turning into a *different* id.
That is the first item on the follow-up list below.

## Step 3 - New automated tests

| File | Level | What it checks |
|---|---|---|
| `tests/unit/totp.test.ts` (20 tests) | Unit | 2FA codes with a frozen clock: current step, one step before/after accepted, two steps rejected, spaces ignored, wrong secret, malformed code or secret returns `false` and never throws; recovery codes: 8 by default, `XXXXX-XXXXX`, no look-alike characters, no repeats |
| `tests/unit/geo.test.ts` (9 tests) | Unit | Haversine distance against figures worked out from the sphere (1 degree = 111,195 m, half-circumference = 20,015,087 m), symmetry, a degree of longitude at 60 degrees north, Bangkok to Chiang Mai range, whole metres |
| `tests/unit/params.test.ts` (17 tests) | Unit (characterization) | see Step 2 |
| `tests/feature/listingIdParam.test.ts` (5 tests) | Component (supertest + PostgreSQL) | `GET /api/v1/listings/:id`: `abc`, `0`, `-5`, `1.5` get exactly the same status and body as a well-formed id that does not exist |

I checked that the tests can fail, by changing the source temporarily and restoring it:

* `authenticator.options = { window: 0 }` in `src/lib/totp.ts` turned the "step before" and "step after" tests red.
* changing the Earth radius in `src/lib/geo.ts` turned four distance tests red.

(One test of mine failed at the start because of a mistake in my own regular expression, not in ChaoJakk's code; it was fixed.)

Run only these:

```powershell
cd platform\api
npx vitest run tests/unit/totp.test.ts tests/unit/geo.test.ts tests/unit/params.test.ts tests/feature/listingIdParam.test.ts
```

## Step 4 - Readiness checklist (backend)

0 = not there, 1 = partly / manual, 2 = complete and automatic. Round 1 is `origin/main` before this branch, round 2 is this branch.

| # | Item | Round 1 | Round 2 | Evidence |
|---|---|---|---|---|
| 1 | Test boundaries are clearly named | 1 | 2 | `tests/unit` and `tests/feature` exist, but no document said what each is for. Steps 1 to 3 above are that document. |
| 2 | No-I/O tests are separated from tests that need a DB | 1 | 1 | The folders are separate, but `globalSetup` applies to **all** tests, so even `tests/unit/geo.test.ts` waits for the database. |
| 3 | All tests run with one command | 1 | 1 | `npm test` in `api`, a second one in `frontend`, and they need `.env` and a running Postgres. |
| 4 | Test DB is built from versioned migrations | 2 | 2 | `globalSetup.ts` |
| 5 | No manual database steps | 1 | 1 | The development Postgres comes from a compose file outside the repository (see `AGENTS.md`). |
| 6 | Tests run the same locally and in CI | 2 | 2 | `ci.yml` calls the same npm scripts with a Postgres service. |
| 7 | Test data from builders / factories | 2 | 2 | `tests/helpers/factories.ts` |
| 8 | Tests do not depend on each other | 2 | 2 | `resetDatabase` between files, files run one at a time. (I did not run them in random order.) |
| 9 | Time and randomness are controllable | 1 | 1 | Fake timers appear in 5 files only and there is no seeded random data helper. |
| 10 | Important dependencies are injectable | 1 | 1 | `createApp()` is a seam, but Prisma is a module-level singleton, so the database cannot be replaced. |
| 11 | Test doubles used at the right level | 2 | 2 | `vi.mock` in 11 files and `vi.spyOn` in 4 out of 223: the database is real and mocks are rare. |
| 12 | Riskiest legacy part has characterization tests | 1 | 1 | No explicit characterization tests; `parseId` is the first (small) one. |
| | **Total (of 24)** | **17** | **18** | |

The score barely moves because ChaoJakk was already well tested. The value of this branch is in the findings below.

## What I found, and what I would do next

1. **`npm run typecheck` already fails on `origin/main`** (commit `8da4494d`): `tests/unit/labelParts.test.ts` lines 159 and 160 read
   `hoursCharged`, which is not a property of `RefundBreakdown`. CI runs typecheck before the tests, so this would turn the pipeline red. I did not touch that file.
2. **Unit tests need a database.** Split `vitest.config.ts` into two projects (`unit` without `globalSetup`, `feature` with it) so `npm run test:unit` runs in a second without Docker.
3. **`parseId` accepts `"1e3"`, `"0x10"`, `" 7 "` and loses precision above 2^53.** Use a strict `/^[1-9]\d*$/` check and `Number.isSafeInteger`, and change the `WEIRD` tests in `params.test.ts` on purpose when doing it.
4. **Add seeded random data** (`@faker-js/faker` with a fixed seed) to the factories, so the values that do not matter to a test are not hand-written constants.

## Concepts used

Test boundaries and the pyramid, unit vs component tests, characterization tests, equivalence partitioning and boundary values (TOTP window, id shapes),
worked-out expected values instead of copying the code's output, test isolation, mutation checks (temporary change to the source to prove a test can fail),
and a readiness checklist to choose the next improvement.

## สรุปเทคนิคที่ใช้ใน Lab 08 (ภาษาเราเอง)

| เทคนิค | ใช้ที่ไหน | เพราะอะไรถึงเลือก | มีประโยชน์กับการเทสยังไง |
|---|---|---|---|
| **Characterization test** (จดว่าโค้ดทำอะไรอยู่ตอนนี้) | `params.test.ts` กับ `parseId` | ไม่รู้ว่ามีใครพึ่งพฤติกรรมแปลก ๆ อยู่ไหม จึงยังไม่แก้ แค่จดไว้ก่อน | ถ้าวันหลังมีคนแก้ `parseId` test จะบอกทันทีว่าพฤติกรรมไหนเปลี่ยน ตอนนี้ได้รายการ "ของแปลก" 4 ข้อไว้ทำต่อ |
| **ค่าคาดหวังคำนวณจากสูตร ไม่ใช่ copy จากผลของโค้ด** | `geo.test.ts` (1 องศา = 111,195 ม. จาก 2πR/360) | ถ้าเอาผลที่โค้ดตอบมาเป็นค่าคาดหวัง test จะเขียวเสมอแม้โค้ดผิด | test ตรวจความถูกต้องจริง ลองเปลี่ยนรัศมีโลกในโค้ด test แดง 4 ข้อ |
| **ตรึงเวลา (fake timers)** | `totp.test.ts` | รหัส 2FA เปลี่ยนทุก 30 วินาที ถ้าใช้เวลาจริง test จะสุ่มพัง | ทดสอบ "ช้าไป 1 ช่วง / เร็วไป 1 ช่วง / เกิน 2 ช่วง" ได้แม่นและซ้ำได้ |
| **Boundary value analysis** | หน้าต่างเวลา ±1 ช่วงของ TOTP | บั๊กชอบอยู่ที่ขอบ | แก้ `window: 1` เป็น 0 ในโค้ด test แดง 2 ข้อ |
| **Component test (supertest + Postgres จริง)** | `listingIdParam.test.ts` | อยากรู้ว่า route แปลงข้อผิดพลาดเป็นคำตอบเดียวกันจริงไหม unit test ตรวจแค่ว่าฟังก์ชัน throw | พิสูจน์สัญญาในคอมเมนต์ของ `parseId` ว่า id แปลก ๆ ตอบเหมือน id ที่ไม่มี |
| **ลองทำให้ test แดงเอง (mutation check)** | แก้ซอร์สชั่วคราวแล้วคืน | test ที่ไม่เคยแดงอาจไม่ได้เทสอะไร | มั่นใจว่า test จับ bug ได้จริง |
| **Readiness checklist** | ตารางคะแนน 17 -> 18 | ให้มีหลักฐานว่าควรทำอะไรต่อ ไม่ใช่เดา | เห็นว่าจุดอ่อนจริงคือ unit test ยังต้องรอฐานข้อมูล และ typecheck พังอยู่แล้วบน `origin/main` |
