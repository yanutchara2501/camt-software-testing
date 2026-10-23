// Fakes: real behaviour, but the data lives in arrays instead of Postgres.
// They keep the same rules as the Pg versions (for example candidates are ordered by number),
// otherwise a test could pass on a fake that "lies".
import { Candidate, District, Party, Role, User } from '../../src/domain/types';
import { CandidateRepository, NewCandidate } from '../../src/repositories/candidateRepository';
import { DistrictRepository } from '../../src/repositories/districtRepository';
import { NewParty, PartyRepository } from '../../src/repositories/partyRepository';
import { NewUser, UserRepository } from '../../src/repositories/userRepository';

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
  constructor(private readonly districts: District[] = []) {}

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
