// Fakes: real behaviour, but the data lives in arrays instead of Postgres.
// They keep the same rules as the Pg versions (for example candidates are ordered by number),
// otherwise a test could pass on a fake that "lies".
import { Candidate, District, Party, Role, User } from '../../src/domain/types';
import { CandidateRepository, NewCandidate } from '../../src/repositories/candidateRepository';
import { DistrictRepository } from '../../src/repositories/districtRepository';
import { NewParty, PartyRepository } from '../../src/repositories/partyRepository';
import { NewUser, UserRepository } from '../../src/repositories/userRepository';
import { ElectionRepository } from '../../src/repositories/electionRepository';
import { CandidateChoice, VoteRepository } from '../../src/repositories/voteRepository';

export class InMemoryUserRepository implements UserRepository {
  readonly users: User[] = [];
  private nextId = 1;

  async findById(id: number): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async findByNationalId(nationalId: string): Promise<User | null> {
    return this.users.find((u) => u.nationalId === nationalId) ?? null;
  }

  async create(user: NewUser): Promise<User> {
    const created: User = { ...user, id: this.nextId++, role: 'VOTER' };
    this.users.push(created);
    return created;
  }

  async updateRole(id: number, role: Role): Promise<User | null> {
    const user = this.users.find((u) => u.id === id);
    if (!user) return null;
    user.role = role;
    return user;
  }
}

export class InMemoryDistrictRepository implements DistrictRepository {
  private readonly closedAtById = new Map<string, Date>();

  constructor(private readonly districts: District[] = []) {}

  async closedAt(id: string): Promise<Date | null> {
    return this.closedAtById.get(id) ?? null;
  }

  async close(id: string, at: Date): Promise<boolean> {
    if (this.closedAtById.has(id)) return false; // same rule as the real UPDATE ... WHERE closed_at IS NULL
    this.closedAtById.set(id, at);
    return true;
  }

  async findAll(): Promise<District[]> {
    return [...this.districts].sort((a, b) => a.province.localeCompare(b.province) || a.number - b.number);
  }

  async findById(id: string): Promise<District | null> {
    return this.districts.find((d) => d.id === id) ?? null;
  }
}

export class InMemoryPartyRepository implements PartyRepository {
  readonly parties: Party[] = [];
  private nextId = 1;

  async findAll(): Promise<Party[]> {
    return [...this.parties].sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: number): Promise<Party | null> {
    return this.parties.find((p) => p.id === id) ?? null;
  }

  async findByName(name: string): Promise<Party | null> {
    return this.parties.find((p) => p.name === name) ?? null;
  }

  async create(party: NewParty): Promise<Party> {
    const created: Party = { ...party, id: this.nextId++ };
    this.parties.push(created);
    return created;
  }
}

export class InMemoryCandidateRepository implements CandidateRepository {
  readonly candidates: Candidate[] = [];
  private nextId = 1;

  // needs the party repository because a Candidate carries partyName (a JOIN in the real SQL)
  constructor(private readonly parties: PartyRepository) {}

  async findById(id: number): Promise<Candidate | null> {
    return this.candidates.find((c) => c.id === id) ?? null;
  }

  async findByDistrict(districtId: string): Promise<Candidate[]> {
    return this.candidates.filter((c) => c.districtId === districtId).sort((a, b) => a.number - b.number);
  }

  async findByParty(partyId: number): Promise<Candidate[]> {
    return this.candidates
      .filter((c) => c.partyId === partyId)
      .sort((a, b) => a.districtId.localeCompare(b.districtId) || a.number - b.number);
  }

  async create(candidate: NewCandidate): Promise<Candidate> {
    const party = await this.parties.findById(candidate.partyId);
    const created: Candidate = { ...candidate, id: this.nextId++, partyName: party?.name ?? '' };
    this.candidates.push(created);
    return created;
  }
}

export class InMemoryVoteRepository implements VoteRepository {
  private readonly votes = new Map<number, number>(); // voterId -> candidateId

  // needs the candidates because the real SQL only counts votes for candidates of the asked district
  constructor(private readonly candidates: CandidateRepository) {}

  /** Test shortcut: put a vote in without any rules. */
  cast(voterId: number, candidateId: number): void {
    this.votes.set(voterId, candidateId);
  }

  /** What a voter chose, or undefined. For assertions. */
  voteOf(voterId: number): number | undefined {
    return this.votes.get(voterId);
  }

  async castVote(voterId: number, candidateId: number, _at: Date): Promise<{ changed: boolean }> {
    const changed = this.votes.has(voterId);
    this.votes.set(voterId, candidateId);
    return { changed };
  }

  async choicesFor(districtId: string, voterId: number): Promise<CandidateChoice[]> {
    const inDistrict = await this.candidates.findByDistrict(districtId);
    return inDistrict.map((c) => ({
      id: c.id,
      number: c.number,
      name: `${c.firstName} ${c.lastName}`,
      party: c.partyName,
      selected: this.votes.get(voterId) === c.id,
    }));
  }

  async countByCandidate(districtId: string): Promise<Map<number, number>> {
    const inDistrict = new Set((await this.candidates.findByDistrict(districtId)).map((c) => c.id));
    const tally = new Map<number, number>();
    for (const candidateId of this.votes.values()) {
      if (inDistrict.has(candidateId)) tally.set(candidateId, (tally.get(candidateId) ?? 0) + 1);
    }
    return tally;
  }
}

/** The election opening time is just a value that a test sets. */
export class InMemoryElectionRepository implements ElectionRepository {
  constructor(public opensAtValue: Date | null = null) {}

  async opensAt(): Promise<Date | null> {
    return this.opensAtValue;
  }
}
