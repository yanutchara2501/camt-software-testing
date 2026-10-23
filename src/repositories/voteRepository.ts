import { Pool } from 'pg';

/** One line of the ballot as the voter sees it. */
export interface CandidateChoice {
  id: number;
  number: number;
  name: string;
  party: string;
  selected: boolean;
}

export interface VoteRepository {
  /** Number of votes per candidate id for the candidates of one district. Candidates with no votes are absent. */
  countByCandidate(districtId: string): Promise<Map<number, number>>;

  /** Saves the vote of a voter. A second call for the same voter replaces the first vote (`changed: true`). */
  castVote(voterId: number, candidateId: number, at: Date): Promise<{ changed: boolean }>;

  /** The candidates of a district in number order, with a flag for the one this voter chose. */
  choicesFor(districtId: string, voterId: number): Promise<CandidateChoice[]>;
}

export class PgVoteRepository implements VoteRepository {
  constructor(private readonly pool: Pool) {}

  async countByCandidate(districtId: string): Promise<Map<number, number>> {
    const { rows } = await this.pool.query<{ candidate_id: number; votes: string }>(
      `SELECT v.candidate_id, COUNT(*) AS votes
       FROM votes v JOIN candidates c ON c.id = v.candidate_id
       WHERE c.district_id = $1
       GROUP BY v.candidate_id`,
      [districtId],
    );
    // COUNT(*) comes back as a string (bigint), so it is converted here, in the one place that knows the SQL
    return new Map(rows.map((row) => [row.candidate_id, Number(row.votes)]));
  }

  async castVote(voterId: number, candidateId: number, at: Date): Promise<{ changed: boolean }> {
    // ONE statement. The old code did SELECT, then INSERT or UPDATE, so two requests of the same voter at the
    // same moment could both see "no vote yet" and the second INSERT failed with a primary key error (500).
    // `xmax = 0` is true only for a row that was just inserted, false for a row that was updated.
    const { rows } = await this.pool.query<{ inserted: boolean }>(
      `INSERT INTO votes (voter_id, candidate_id, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (voter_id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id, updated_at = EXCLUDED.updated_at
       RETURNING (xmax = 0) AS inserted`,
      [voterId, candidateId, at],
    );
    return { changed: !rows[0].inserted };
  }

  async choicesFor(districtId: string, voterId: number): Promise<CandidateChoice[]> {
    const { rows } = await this.pool.query<{
      id: number;
      number: number;
      first_name: string;
      last_name: string;
      party_name: string;
      my_vote: number | null;
    }>(
      `SELECT c.id, c.number, c.first_name, c.last_name, p.name AS party_name, v.candidate_id AS my_vote
       FROM candidates c
       JOIN parties p ON p.id = c.party_id
       LEFT JOIN votes v ON v.candidate_id = c.id AND v.voter_id = $2
       WHERE c.district_id = $1
       ORDER BY c.number`,
      [districtId, voterId],
    );
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      name: `${r.first_name} ${r.last_name}`,
      party: r.party_name,
      selected: r.my_vote != null,
    }));
  }
}
