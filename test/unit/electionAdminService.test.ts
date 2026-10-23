import { ConflictError, NotFoundError, ValidationError } from '../../src/errors';
import { CandidateInput, ElectionAdminService } from '../../src/services/electionAdminService';
import {
  InMemoryCandidateRepository,
  InMemoryDistrictRepository,
  InMemoryPartyRepository,
} from '../support/inMemoryRepositories';

// Everything here uses FAKES. After adding 3 candidates the answer of `findByDistrict` changes three times,
// which would be painful to script with jest.fn().mockResolvedValueOnce(...).
function setUp() {
  const districts = new InMemoryDistrictRepository([
    { id: 'CM-1', province: 'Chiang Mai', number: 1 },
    { id: 'CM-2', province: 'Chiang Mai', number: 2 },
  ]);
  const parties = new InMemoryPartyRepository();
  const candidates = new InMemoryCandidateRepository(parties);
  const service = new ElectionAdminService(parties, candidates, districts);
  return { service, parties, candidates };
}

const candidate = (partyId: number, number: number): CandidateInput => ({
  partyId,
  number,
  firstName: 'Somchai',
  lastName: `Number${number}`,
});

describe('ElectionAdminService.createParty', () => {
  it('creates a party and trims the name', async () => {
    const { service } = setUp();

    const party = await service.createParty({ name: '  Blue Party ', policy: 'Free trains' });

    expect(party).toMatchObject({ name: 'Blue Party', policy: 'Free trains', logoUrl: null });
  });

  it('rejects a party name that already exists', async () => {
    const { service } = setUp();
    await service.createParty({ name: 'Blue', policy: 'A' });

    const duplicate = service.createParty({ name: 'Blue', policy: 'B' });

    await expect(duplicate).rejects.toThrow(ConflictError);
  });

  it.each([
    ['an empty name', { name: '  ', policy: 'x' }],
    ['an empty policy', { name: 'Blue', policy: '' }],
  ])('rejects %s', async (_label, input) => {
    const { service } = setUp();

    await expect(service.createParty(input)).rejects.toThrow(ValidationError);
  });
});

describe('ElectionAdminService.addCandidate', () => {
  it('adds a candidate to a district', async () => {
    const { service } = setUp();
    const party = await service.createParty({ name: 'Blue', policy: 'x' });

    const created = await service.addCandidate('CM-1', candidate(party.id, 1));

    expect(created).toMatchObject({ districtId: 'CM-1', partyId: party.id, partyName: 'Blue', number: 1 });
  });

  it('rejects a candidate number already used in the district', async () => {
    const { service } = setUp();
    const blue = await service.createParty({ name: 'Blue', policy: 'x' });
    const red = await service.createParty({ name: 'Red', policy: 'y' });
    await service.addCandidate('CM-1', candidate(blue.id, 1));

    const sameNumber = service.addCandidate('CM-1', candidate(red.id, 1));

    await expect(sameNumber).rejects.toThrow('candidate number already used in this district');
  });

  it('rejects a second candidate from the same party in the district', async () => {
    const { service } = setUp();
    const blue = await service.createParty({ name: 'Blue', policy: 'x' });
    await service.addCandidate('CM-1', candidate(blue.id, 1));

    const sameParty = service.addCandidate('CM-1', candidate(blue.id, 2));

    await expect(sameParty).rejects.toThrow('party already has a candidate in this district');
  });

  it('allows the same number and the same party in a different district', async () => {
    const { service, candidates } = setUp();
    const blue = await service.createParty({ name: 'Blue', policy: 'x' });
    await service.addCandidate('CM-1', candidate(blue.id, 1));

    await service.addCandidate('CM-2', candidate(blue.id, 1));

    expect(candidates.candidates).toHaveLength(2);
  });

  it('rejects an unknown party', async () => {
    const { service } = setUp();

    await expect(service.addCandidate('CM-1', candidate(999, 1))).rejects.toThrow('unknown party');
  });

  it('rejects an unknown district', async () => {
    const { service } = setUp();
    const blue = await service.createParty({ name: 'Blue', policy: 'x' });

    await expect(service.addCandidate('XX-9', candidate(blue.id, 1))).rejects.toThrow(NotFoundError);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects the candidate number %p', async (number) => {
    const { service } = setUp();
    const blue = await service.createParty({ name: 'Blue', policy: 'x' });

    await expect(service.addCandidate('CM-1', candidate(blue.id, number))).rejects.toThrow(ValidationError);
  });
});
