import { APIRequestContext, expect } from '@playwright/test';

// A thin "driver" for the acceptance tests: it hides the HTTP details, so a test reads like the user story.
// The deployed stack is never truncated between runs, so every voter gets a new valid national id.
let counter = 0;

function uniqueNationalId(): string {
  counter += 1;
  const base = `8${(Date.now() % 1e9).toString().padStart(9, '0')}${counter.toString().padStart(2, '0')}`;
  const sum = [...base].reduce((acc, digit, i) => acc + Number(digit) * (13 - i), 0);
  return base + ((11 - (sum % 11)) % 10);
}

export interface Session {
  token: string;
}

export class ElectionApi {
  constructor(private readonly request: APIRequestContext) {}

  private auth(session: Session) {
    return { Authorization: `Bearer ${session.token}` };
  }

  async login(nationalId: string, password: string): Promise<Session> {
    const response = await this.request.post('/auth/login', { data: { nationalId, password } });
    expect(response.status(), 'login').toBe(200);
    return { token: (await response.json()).token };
  }

  /** Logs in with the commissioner account that the e2e seed creates. */
  loginAsCommissioner(): Promise<Session> {
    return this.login('1100000000024', 'commission1234');
  }

  async registerVoter(districtId: string): Promise<Session> {
    const nationalId = uniqueNationalId();
    const registered = await this.request.post('/auth/register', {
      data: {
        nationalId,
        password: 'voter1234',
        firstName: 'Test',
        lastName: 'Voter',
        address: 'CAMT',
        districtId,
      },
    });
    expect(registered.status(), 'register voter').toBe(201);
    return this.login(nationalId, 'voter1234');
  }

  async createParty(commissioner: Session, name: string): Promise<{ id: number }> {
    const response = await this.request.post('/parties', {
      headers: this.auth(commissioner),
      data: { name, policy: `Policy of ${name}` },
    });
    expect(response.status(), 'create party').toBe(201);
    return response.json();
  }

  async addCandidate(commissioner: Session, districtId: string, partyId: number, number: number) {
    const response = await this.request.post(`/districts/${districtId}/candidates`, {
      headers: this.auth(commissioner),
      data: { partyId, number, firstName: 'Candidate', lastName: `No${number}` },
    });
    expect(response.status(), 'add candidate').toBe(201);
    return response.json();
  }

  /** Votes for the candidate with the given number in the voter's own district. */
  async voteFor(voter: Session, number: number) {
    const list = await this.request.get('/me/candidates', { headers: this.auth(voter) });
    const candidates: { id: number; number: number }[] = await list.json();
    const chosen = candidates.find((c) => c.number === number);
    expect(chosen, `candidate number ${number} is visible to the voter`).toBeDefined();

    const response = await this.request.put('/me/vote', {
      headers: this.auth(voter),
      data: { candidateId: chosen!.id },
    });
    expect([200, 201], 'vote accepted').toContain(response.status());
  }

  /** Like voteFor, but returns the HTTP status instead of asserting success. */
  async tryVoteFor(voter: Session, number: number): Promise<number> {
    const list = await this.request.get('/me/candidates', { headers: this.auth(voter) });
    const candidates: { id: number; number: number }[] = await list.json();
    const chosen = candidates.find((c) => c.number === number);
    const response = await this.request.put('/me/vote', {
      headers: this.auth(voter),
      data: { candidateId: chosen!.id },
    });
    return response.status();
  }

  closePoll(commissioner: Session, districtId: string) {
    return this.request.post(`/districts/${districtId}/close`, { headers: this.auth(commissioner) });
  }

  results(districtId: string) {
    return this.request.get(`/districts/${districtId}/results`);
  }
}
