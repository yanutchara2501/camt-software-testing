import { Clock } from '../clock';
import { District } from '../domain/types';
import { ConflictError, NotFoundError } from '../errors';
import { CandidateRepository } from '../repositories/candidateRepository';
import { DistrictRepository } from '../repositories/districtRepository';
import { VoteRepository } from '../repositories/voteRepository';

export interface CandidateResult {
  number: number;
  firstName: string;
  lastName: string;
  partyName: string;
  /** Only present after the poll is closed. */
  votes?: number;
}

export type DistrictResults =
  | { district: District; closed: false; candidates: CandidateResult[] }
  | { district: District; closed: true; closedAt: Date; candidates: Required<CandidateResult>[] };

/** Closing the poll of a district and publishing its result. */
export class PollService {
  constructor(
    private readonly districts: DistrictRepository,
    private readonly candidates: CandidateRepository,
    private readonly votes: VoteRepository,
    private readonly clock: Clock,
  ) {}

  async close(districtId: string): Promise<{ districtId: string; closedAt: Date }> {
    if (!(await this.districts.findById(districtId))) throw new NotFoundError('district not found');

    const closedAt = this.clock.now();
    if (!(await this.districts.close(districtId, closedAt))) throw new ConflictError('poll is already closed');

    return { districtId, closedAt };
  }

  async resultsFor(districtId: string): Promise<DistrictResults> {
    const district = await this.districts.findById(districtId);
    if (!district) throw new NotFoundError('district not found');

    const candidates = await this.candidates.findByDistrict(districtId);
    const closedAt = await this.districts.closedAt(districtId);

    // The scores are not even read from the database while the poll is open.
    if (!closedAt) {
      return {
        district,
        closed: false,
        candidates: candidates.map(({ number, firstName, lastName, partyName }) => ({
          number,
          firstName,
          lastName,
          partyName,
        })),
      };
    }

    const tally = await this.votes.countByCandidate(districtId);
    return {
      district,
      closed: true,
      closedAt,
      candidates: candidates.map(({ id, number, firstName, lastName, partyName }) => ({
        number,
        firstName,
        lastName,
        partyName,
        votes: tally.get(id) ?? 0,
      })),
    };
  }
}
