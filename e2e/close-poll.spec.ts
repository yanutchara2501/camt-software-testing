import { expect, test } from '@playwright/test';
import { ElectionApi } from './support/electionApi';

// Acceptance test (the outer loop of outside-in development):
//   As a commissioner I want to close the poll of a district,
//   so that the public can see the scores of that district.
test('after the commissioner closes the poll, everybody sees the score of each candidate', async ({ request }) => {
  const api = new ElectionApi(request);
  const commissioner = await api.loginAsCommissioner();
  const blue = await api.createParty(commissioner, 'Blue Party (close-poll e2e)');
  const red = await api.createParty(commissioner, 'Red Party (close-poll e2e)');
  await api.addCandidate(commissioner, 'CM-3', blue.id, 1);
  await api.addCandidate(commissioner, 'CM-3', red.id, 2);
  const voters = [await api.registerVoter('CM-3'), await api.registerVoter('CM-3'), await api.registerVoter('CM-3')];
  await api.voteFor(voters[0], 1);
  await api.voteFor(voters[1], 1);
  await api.voteFor(voters[2], 2);

  const before = await (await api.results('CM-3')).json();
  const closing = await api.closePoll(commissioner, 'CM-3');
  const after = await (await api.results('CM-3')).json();
  const lateVote = await api.tryVoteFor(voters[0], 2);

  expect(before.closed).toBe(false);
  expect(before.candidates.every((c: object) => !('votes' in c))).toBe(true);
  expect(closing.status()).toBe(200);
  expect(lateVote).toBe(409); // stretch: nobody can change a vote after the poll is closed
  expect(after.closed).toBe(true);
  expect(after.closedAt).toEqual(expect.any(String));
  expect(after.candidates.map((c: { number: number; votes: number }) => [c.number, c.votes])).toEqual([
    [1, 2],
    [2, 1],
  ]);
});
