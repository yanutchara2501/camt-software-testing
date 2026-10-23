import { seedFaker } from './seedFaker';

// Runs before every test (jest "setupFilesAfterEnv"): each test starts from the same faker state.
beforeEach(() => {
  seedFaker();
});
