# สรุปเทคนิคการทดสอบที่ใช้ในงานนี้ (เขียนด้วยภาษาเราเอง)

ตารางนี้ตอบ 3 อย่างของทุกเทคนิค: **ใช้อะไร / ทำไมถึงเลือก / ช่วยการเทสยังไง**
รายละเอียดเต็มของแต่ละ step อยู่ใน `docs/workshop/NN-*.md` (เขียนเป็นภาษาอังกฤษ) ไฟล์นี้เป็นฉบับสรุปภาษาไทยไว้อ่านเร็ว ๆ

## 1. วางโครงว่าจะเทสอะไรที่ระดับไหน (Lab 00, 01)

| เทคนิค | ใช้ที่ไหน | ทำไมถึงเลือก | ช่วยการเทสยังไง |
|---|---|---|---|
| **Test pyramid / test boundary** (unit, component, e2e) | `test/unit`, `test/integration`, `e2e` | test ยิ่งทดสอบหลายส่วนพร้อมกันยิ่งช้าและบอกไม่ได้ว่าพังตรงไหน จึงเลือกระดับ "ต่ำสุดที่ยังมั่นใจพอ" | unit รันเป็นวินาที พังแล้วรู้ฟังก์ชันเลย ส่วน e2e เก็บไว้แค่ journey สำคัญ ผล: suite เร็ว หาที่พังง่าย |
| **รันให้แดงแล้วแก้ให้เขียว (red-green)** | Lab 00 แก้ `(13 - i)` เป็น `(12 - i)` | อยากรู้ว่า test จับ bug ได้จริงไหม | เห็นกับตาว่า unit บอกชัด (checksum ผิด) ส่วน component บอกกว้าง (สมัครไม่ได้) เป็นเหตุผลที่ต้องมี unit เยอะ |

## 2. เขียน test ให้อ่านง่าย (Lab 02)

| เทคนิค | ใช้ที่ไหน | ทำไมถึงเลือก | ช่วยการเทสยังไง |
|---|---|---|---|
| **Arrange-Act-Assert** | ทุกไฟล์ใน `test/unit` | 1 test ควรมีแค่ 1 พฤติกรรม | ชื่อ test อ่านเหมือนสเปก พอแดงรู้เลยว่าอะไรพัง |
| **จับ test smell** (Obscure, Eager, Assertion Roulette, มี if/for, ไม่มี assertion) | แก้ `smelly.test.ts` | test ที่เขียนรวบจะบอกอะไรไม่ได้เวลาพัง | เอา `hashPassword` คืนค่า plain text ทดสอบ เห็นว่าไฟล์เดิมแดงที่ `stuff > works` อย่างเดียว ส่วนไฟล์ใหม่แดง 4 ข้อ ชื่อชัด |
| **`it.each` (data-driven)** | `thaiNationalId.test.ts` | แทน for loop | เพิ่มเคสได้เป็นแถว ๆ แต่ละแถวมีชื่อ ไม่มี logic ใน test |
| **Equivalence partitioning** (แบ่งกลุ่มข้อมูล) | เลขบัตร: ถูก / checksum ผิด / ความยาวผิด / ไม่ใช่ตัวเลข | ทดสอบทุกค่าไม่ไหว | เลือกตัวแทนต่อกลุ่ม ได้เคสน้อยแต่ครอบคลุม |
| **Boundary value analysis** (ค่าขอบ) | รหัสผ่าน 7 กับ 8 ตัว, เวลาเปิดหีบ, อายุ token | bug ชอบอยู่ตรงขอบ | จับ `<` กับ `<=` สลับกันได้ |

## 3. ตัวแทนปลอม (test double) (Lab 03)

| เทคนิค | ใช้ที่ไหน | ทำไมถึงเลือก | ช่วยการเทสยังไง |
|---|---|---|---|
| **Dummy** | `TokenService` ที่ throw ถ้าถูกเรียก (ตอนทดสอบ register) | ต้องส่งให้ครบแต่ไม่ควรถูกใช้ | ถ้าใครเผลอเรียกมัน test แดงทันที |
| **Stub** | `DistrictRepository` ที่ตอบ "เขต CM-1 มีอยู่" | คุมข้อมูลขาเข้าโดยไม่ต้องต่อ DB | เทสเร็ว ตั้งสถานการณ์ได้ตามต้องการ |
| **Spy** | `jest.spyOn(users, 'create')` | อยากดูว่าส่งอะไรเข้า repository (เช่น ต้องเป็น hash ไม่ใช่รหัสผ่านจริง) | ตรวจผลข้างเคียงได้ โดย fake ยังทำงานจริง |
| **Mock** | `TokenService.issue` ต้องถูกเรียก 1 ครั้งด้วย principal นี้ | บางเรื่อง "การถูกเรียก" คือตัวพฤติกรรม | ล็อกกฎอย่าง "รหัสผิดห้ามออก token" |
| **Fake** | `InMemory*Repository` | ผลลัพธ์เปลี่ยนตามเวลา เช่น เพิ่มผู้สมัครแล้วรายการยาวขึ้น ใช้ `jest.fn()` เขียนยาก | ทำงานเหมือน DB เล็ก ๆ ทดสอบกฎหลายขั้นได้ง่าย |
| **Contract test** | `partyRepository.contract.test.ts`, `districtRepository.contract.test.ts`, `voteRepository.contract.test.ts` | กลัว fake "โกหก" คือประพฤติไม่เหมือนของจริง | ชุด expectation เดียวรันกับทั้ง fake และ Postgres ถ้าผ่านทั้งคู่ เชื่อ fake ได้ |
| **Fake timers vs Clock ที่ inject** | `jwtTokenService.test.ts` (fake timers), `Clock` (โค้ดเราเอง) | เวลาเป็น dependency เหมือนกัน | Clock ใช้กับโค้ดเรา, fake timers ใช้กับ library ที่แก้ไม่ได้ (`jsonwebtoken`) ทดสอบอายุ token โดยไม่ต้องรอ |
| **ไม่ mock ของที่ไม่ใช่ของเรา** | ไม่ mock `pg.Pool` | mock ของคนอื่นพิสูจน์แค่ว่าเราเรียกตามที่นึกไว้ | จุดที่ควรใช้ double คือ interface ของเราเอง ส่วน SQL ทดสอบกับ DB จริง |

## 4. ข้อมูลทดสอบและฐานข้อมูล (Lab 04)

| เทคนิค | ใช้ที่ไหน | ทำไมถึงเลือก | ช่วยการเทสยังไง |
|---|---|---|---|
| **Test data builder** | `aVoter().inDistrict('CM-2')` | เขียน object เต็มทุกครั้ง ยาวและไม่รู้ว่าค่าไหนสำคัญ | test บอกเฉพาะสิ่งที่สำคัญ อ่านง่าย |
| **Faker + seed คงที่** | `seedFaker.ts` | ค่าที่ไม่สำคัญไม่ควรเขียนมือ แต่สุ่มเลยก็ทำซ้ำไม่ได้ | ได้ข้อมูลหลากหลาย และ test แดงแล้วรันซ้ำได้ข้อมูลเดิม (`FAKER_SEED=123` ไว้ลองชุดอื่น) |
| **Fresh fixture** (ล้างตารางก่อนทุก test) | `truncateAll` | test ต้องไม่พึ่งกัน | สลับลำดับก็ผ่าน (ลองด้วย `jest --randomize`) |
| **Liquibase + rollback** | `db/changelog` | schema เป็นโค้ด ทุก environment สร้างเหมือนกัน | ลองแล้วเจอว่า: ลืม `include` ไฟล์ใหม่จะไม่รันและไม่ error, แก้ changeset เก่าติด checksum ต้องสร้างไฟล์ใหม่ |

## 5. CI และด่านคุณภาพ (Lab 05)

| เทคนิค | ใช้ที่ไหน | ทำไมถึงเลือก | ช่วยการเทสยังไง |
|---|---|---|---|
| **CI แบบ fail fast** | `.github/workflows/ci.yml` (unit -> integration -> e2e) | ของถูกและเร็วควรมาก่อน | unit แดงก็ไม่เสียเวลารันของแพง |
| **Pipeline เรียก npm script ชุดเดียวกับในเครื่อง** | ใช้ `npm run ...` | ไม่ให้ logic ไปอยู่ใน CI | เครื่องเราเขียว CI ก็เขียว |
| **Coverage gate เฉพาะโฟลเดอร์ที่เหมาะ** | `src/domain` 100%, `src/services` 90% | ทั้งโปรเจกต์วัดไม่แฟร์ routes/repositories ถูกเทสด้วย integration | gate แดงตอนเราลืมเทส default logger ของ `VoteService` ช่วยจับช่องที่เทสไม่ถึง |
| **ทดสอบ rollback ของ migration** | `npm run db:test-rollback` | migration ที่ย้อนไม่ได้เป็นระเบิดเวลา | ลองแก้ rollback ผิดชื่อตาราง script แดงทันที |
| ข้อควรจำ | | coverage 100% ไม่ได้แปลว่าไม่มี bug | วัดแค่ว่าบรรทัดถูกรัน ไม่ได้วัดว่าถูกตรวจ |

## 6. พัฒนาจากนอกเข้าใน (Lab 06)

| เทคนิค | ใช้ที่ไหน | ทำไมถึงเลือก | ช่วยการเทสยังไง |
|---|---|---|---|
| **Outside-in / double loop TDD** | ฟีเจอร์ปิดหีบ: e2e -> component -> unit | เริ่มจากสิ่งที่ผู้ใช้เห็น แล้วให้ test เล็กบอกว่าต้องสร้างอะไร | acceptance test แดงด้วยเหตุผลที่ถูก (404 ของ route ที่ยังไม่มี) unit test ของ service บอกเราเองว่าต้องมี Clock, `close()`, `VoteRepository` |
| **Walking skeleton** | e2e รันผ่าน container + Postgres จริงตั้งแต่ต้น | ให้ทุกชั้นต่อกันได้ก่อนเพิ่มรายละเอียด | เจอปัญหาการต่อสายเร็ว |
| **Inject Clock** | `pgDeps(pool, tokens, { clock })` | เวลา `closedAt` ต้องเทียบได้ | test ใช้เวลาตายตัว ไม่ flaky |
| **ให้ฐานข้อมูลตัดสิน** | `UPDATE ... WHERE closed_at IS NULL` | ปิดซ้ำพร้อมกัน | กัน race ใน SQL ไม่ต้องพึ่ง JavaScript |

## 7. โค้ดเก่า (Lab 07)

| เทคนิค | ใช้ที่ไหน | ทำไมถึงเลือก | ช่วยการเทสยังไง |
|---|---|---|---|
| **Characterization test** | `vote.characterization.test.ts` | route โหวตไม่มี test เลย ก่อนแก้ต้องรู้ก่อนว่ามันทำอะไรอยู่ | จดพฤติกรรมจริงรวมที่แปลก (`WEIRD`) พอแก้โค้ด test บอกทันทีว่าอะไรเปลี่ยนโดยไม่ตั้งใจ |
| **Seam / Parameterize constructor** | `voteRoutes({ pool, tokens, clock })` | route ใช้ pool กับเวลาแบบ global ทดสอบไม่ได้ | แทนของจริงด้วยของจำลองได้ |
| **Sprout method** | `ballotRules.ts` (`whyBallotIsClosed`) | ไม่อยากยัด `if` ใหม่ลงกลาง handler ยาว ๆ | กฎใหม่เป็นฟังก์ชันบริสุทธิ์ มี unit test ของตัวเองเร็วมาก |
| **เปลี่ยนพฤติกรรมโดยตั้งใจ** | แก้เรื่อง `Bearer` และ `"abc"` | characterization test ไม่ใช่ของตาย | test แดงเฉพาะที่ตั้งใจเปลี่ยน แก้ test พร้อมเขียนเหตุผลใน commit |

## 8. V&V และข้อ 2 (ระบบเลือกตั้ง)

| เทคนิค | ใช้ที่ไหน | ทำไมถึงเลือก | ช่วยการเทสยังไง |
|---|---|---|---|
| **Verification** (สร้างถูกวิธีไหม) | หาบั๊กจากการอ่านโค้ด: `candidateId: "abc"` ได้ 500, race ตอนโหวต, secret สำรอง `dev-secret` | โค้ดเดิมมีจุดอ่อนที่ test เดิมไม่เคยเจอ | แต่ละจุดมี test พิสูจน์ว่าแดงกับโค้ดเดิม เขียวหลังแก้ (race: แดง 3 ครั้งจาก 3) |
| **Validation** (สร้างสิ่งที่ถูกไหม) | ปิดหีบ, ห้ามโหวตหลังปิด | ตรง user story | e2e ครอบทั้ง journey |
| **Concurrency test** | โหวตพร้อมกัน 10 คำขอ | race ไม่โผล่ในเทสปกติ | พิสูจน์บั๊กและพิสูจน์ว่าแก้แล้วได้จริง |
| **Mutation check ด้วยมือ** | แก้โค้ดชั่วคราวให้ผิด (เช่น ความยาวรหัสผ่าน 8 เป็น 7) | test เขียวไม่ได้แปลว่าดี | ถ้าแก้โค้ดแล้ว test ไม่แดง แปลว่า test ไม่ได้ตรวจจริง |
| **Unit test design** | `docs/election-app/unit-test-design.md` | ออกเคสให้มีที่มา ไม่ใช่นึกเอา | ตาราง UT-xx ผูกกับข้อโจทย์ 2.3.1 ถึง 2.3.6 |

## 9. ข้อ 2 และ Lab 08 กับ ChaoJakk (โปรเจกต์ของตัวเอง)

ดู [`own-project/chaojakk/`](../own-project/chaojakk/README.md) และ [`own-project/chaojakk/vv-unit-test-design.md`](../own-project/chaojakk/vv-unit-test-design.md) เทคนิคเหมือนข้างบน เพิ่ม:

| เทคนิค | ใช้ที่ไหน | ทำไมถึงเลือก | ช่วยการเทสยังไง |
|---|---|---|---|
| **vi.mock (mock ระดับ module)** | `authLogin.test.ts` | `auth.service.ts` ใช้ `prisma` แบบ singleton ไม่มีช่องให้ inject | เปลี่ยนตัวช่วยเป็นของปลอมได้โดยไม่แก้โค้ด (ข้อเสีย: test ผูกกับโครงไฟล์ จึงเป็นข้อเสนอให้ทำ DI ทีหลัง) |
| **Fake ฐานข้อมูลจำลอง "สองคำขอพร้อมกัน"** | UT-R6, R7 | race condition ต้องการสถานะที่เปลี่ยนตามเวลา | เจอช่องโหว่ 2FA ที่ใช้ challenge/recovery code ซ้ำได้ แล้วแก้ด้วย atomic update |
