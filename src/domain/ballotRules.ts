export interface BallotContext {
  now: Date;
  /** When the election opens, or null if no election has been set up. */
  electionOpensAt: Date | null;
  /** When a commissioner closed the voter's district, or null while the poll is open. */
  districtClosedAt: Date | null;
}

/** The reason why nobody can vote or change a vote right now, or null if voting is allowed. */
export function whyBallotIsClosed({ now, electionOpensAt, districtClosedAt }: BallotContext): string | null {
  if (!electionOpensAt || now < electionOpensAt) return 'election is not open';
  if (districtClosedAt) return 'poll is closed';
  return null;
}
