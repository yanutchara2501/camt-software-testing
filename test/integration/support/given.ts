// "Given" helpers for component tests: put the starting data into the real test database
// and hand back what the test needs (ids, tokens). Creation Methods in xUnit Test Patterns terms.
import { Pool } from 'pg';
import { hashPassword } from '../../../src/auth/passwords';
import { TokenService } from '../../../src/auth/tokenService';
import { Candidate, Party, User } from '../../../src/domain/types';
import { PgCandidateRepository } from '../../../src/repositories/candidateRepository';
import { PgPartyRepository } from '../../../src/repositories/partyRepository';
import { PgUserRepository } from '../../../src/repositories/userRepository';
import { aCandidate, aParty, aVoter, CandidateBuilder, PartyBuilder, UserBuilder } from '../../support/builders';

export interface GivenUser {
  user: User;
  password: string;
  token: string;
}

export function givenFor(pool: Pool, tokens: TokenService) {
  const users = new PgUserRepository(pool);
  const parties = new PgPartyRepository(pool);
  const candidates = new PgCandidateRepository(pool);

  return {
    /** Saves a user with the role of the builder and returns the user, the plain password and a valid token. */
    async user(builder: UserBuilder = aVoter()): Promise<GivenUser> {
      const data = builder.build();
      const created = await users.create({
        nationalId: data.nationalId,
        passwordHash: hashPassword(data.password),
        firstName: data.firstName,
        lastName: data.lastName,
        address: data.address,
        districtId: data.districtId,
      });
      const user = data.role === 'VOTER' ? created : ((await users.updateRole(created.id, data.role)) as User);
      const token = tokens.issue({ userId: user.id, role: user.role, districtId: user.districtId });
      return { user, password: data.password, token };
    },

    async party(builder: PartyBuilder = aParty()): Promise<Party> {
      return parties.create(builder.build());
    },

    async candidate(builder: CandidateBuilder = aCandidate()): Promise<Candidate> {
      return candidates.create(builder.build());
    },

    /** Puts a vote straight into the table (the vote route itself is legacy code and is not used here). */
    async vote(voter: User, candidate: Candidate): Promise<void> {
      await pool.query('INSERT INTO votes (voter_id, candidate_id, updated_at) VALUES ($1, $2, now())', [
        voter.id,
        candidate.id,
      ]);
    },

    /** A commissioner closed the poll of this district at `closedAt`. */
    async pollClosed(districtId: string, closedAt: Date): Promise<void> {
      await pool.query('UPDATE districts SET closed_at = $2 WHERE id = $1', [districtId, closedAt]);
    },

    /** The election opens at `opensAt` (default: one hour ago, so voting is already possible). */
    async electionOpenedAt(opensAt: Date = new Date(Date.now() - 60 * 60 * 1000)): Promise<void> {
      await pool.query(
        `INSERT INTO election (id, opens_at) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET opens_at = EXCLUDED.opens_at`,
        [opensAt],
      );
    },
  };
}
