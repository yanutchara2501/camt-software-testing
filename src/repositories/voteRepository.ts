import { Pool } from 'pg';

export interface VoteRepository {
  /** Number of votes per candidate id for the candidates of one district. Candidates with no votes are absent. */
  countByCandidate(districtId: string): Promise<Map<number, number>>;
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
}
