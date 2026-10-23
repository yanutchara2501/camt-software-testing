import { faker, fakerTH } from '@faker-js/faker';

// "Random" test data must still be repeatable. With a fixed seed every run (and every re-run of a single
// red test) builds the same data, so a failure can be reproduced.
// To explore other data: FAKER_SEED=123 npm run test:unit
export const FAKER_SEED = Number(process.env.FAKER_SEED ?? 20261003);

export function seedFaker(seed: number = FAKER_SEED): void {
  faker.seed(seed);
  fakerTH.seed(seed);
}
