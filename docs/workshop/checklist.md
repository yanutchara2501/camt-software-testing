# Readiness checklist

Score: 0 = not there, 1 = partly / manual, 2 = complete and automatic.
Round 1 was filled at the start of the work (the starter code of this repo).
Round 2 is filled at the end of step 08.

| # | Area | Item | Round 1 | Round 2 |
|---|---|---|---|---|
| 1 | Structure | Test boundaries are clearly named | 2 | |
| 2 | Structure | No-I/O tests are separated from tests that need a DB | 2 | |
| 3 | Structure | All tests run with one command | 1 | |
| 4 | Environment | Test DB is built from versioned migrations | 2 | |
| 5 | Environment | No manual database steps | 2 | |
| 6 | Environment | Tests run the same locally and in CI | 0 | |
| 7 | Data | Test data comes from builders / factories | 0 | |
| 8 | Data | Tests do not depend on each other | 1 | |
| 9 | Data | Time and randomness are controllable | 1 | |
| 10 | Design | Important dependencies are injectable (seams) | 1 | |
| 11 | Design | Test doubles are used at the right level | 0 | |
| 12 | Design | The riskiest legacy part has characterization tests | 0 | |
| | | **Total (of 24)** | **12** | |

Notes for round 1:

* 3: `npm test` runs unit + integration but e2e is a separate command.
* 6: there is no CI file in my repository yet (step 05 adds it).
* 8, 9, 10: only the vote routes read the real clock and a global pool, and there is only one integration test so far.

First things to fix after round 1 (each can be done in one day): CI (6), builders (7), doubles (11), characterization tests (12).
