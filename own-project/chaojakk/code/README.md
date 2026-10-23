# ChaoJakk: the file that the V&V comparison is about

`auth.service.ts` is copied from the ChaoJakk repository (`platform/api/src/modules/auth/auth.service.ts`).
It is the only source file that changed between `vv-original` and `vv-improved` there, so it is all that is needed here to read the comparison.
It does not compile on its own, because the rest of the ChaoJakk project is not in this repository.

Compare the two versions: `git diff chaojakk/original chaojakk/improved`.
Explanation: [../vv-unit-test-design.md](../vv-unit-test-design.md). The tests for it: [../tests/unit/authLogin.test.ts](../tests/unit/authLogin.test.ts).

