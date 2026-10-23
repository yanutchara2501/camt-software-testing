import { Principal } from '../auth/tokenService';
import { Clock } from '../clock';
import { whyBallotIsClosed } from '../domain/ballotRules';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { CandidateRepository } from '../repositories/candidateRepository';
import { DistrictRepository } from '../repositories/districtRepository';
import { ElectionRepository } from '../repositories/electionRepository';
import { CandidateChoice, VoteRepository } from '../repositories/voteRepository';

export interface VoteReceipt {
  candidateId: number;
  /** true when the voter had already voted and this call replaced the earlier vote */
  changed: boolean;
  votedAt: Date;
}

/** A candidate id arrives from JSON, so it can be anything. Accept a positive integer, or a string of digits. */
function parseCandidateId(input: unknown): number {
  if (!input) throw new ValidationError('candidateId is required');

  const id = typeof input === 'number' ? input : typeof input === 'string' && /^\d+$/.test(input) ? Number(input) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) throw new ValidationError('candidateId must be a positive integer');
  return id;
}

/** What a voter can do: see the ballot of their district, vote, and change the vote while voting is allowed. */
export class VoteService {
  constructor(
    private readonly votes: VoteRepository,
    private readonly candidates: CandidateRepository,
    private readonly districts: DistrictRepository,
    private readonly election: ElectionRepository,
    private readonly clock: Clock,
    // resolved at call time so that a test can spy on console.log after the service was created
    private readonly log: (message: string) => void = (message) => console.log(message),
  ) {}

  choices(voter: Principal): Promise<CandidateChoice[]> {
    return this.votes.choicesFor(voter.districtId, voter.userId);
  }

  async cast(voter: Principal, candidateIdInput: unknown): Promise<VoteReceipt> {
    // The order of the checks is the order of the original route, so the answers stay the same for every old input.
    if (voter.role !== 'VOTER') throw new ForbiddenError('only voters can vote');
    const candidateId = parseCandidateId(candidateIdInput);

    const now = this.clock.now();
    const closedReason = whyBallotIsClosed({
      now,
      electionOpensAt: await this.election.opensAt(),
      districtClosedAt: await this.districts.closedAt(voter.districtId),
    });
    if (closedReason) throw new ConflictError(closedReason);

    const candidate = await this.candidates.findById(candidateId);
    if (!candidate) throw new NotFoundError('candidate not found');
    if (candidate.districtId !== voter.districtId) throw new ForbiddenError('candidate is not in your district');

    const { changed } = await this.votes.castVote(voter.userId, candidateId, now);
    this.log(
      `[vote] voter ${voter.userId} ${changed ? 'changed vote to' : 'voted for'} ${candidateId} at ${now.toISOString()}`,
    );
    return { candidateId, changed, votedAt: now };
  }
}
