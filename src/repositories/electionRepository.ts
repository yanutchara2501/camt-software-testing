import { Pool } from 'pg';

export interface ElectionRepository {
  /** When voting opens, or null if no election has been set up. */
  opensAt(): Promise<Date | null>;
}

export class PgElectionRepository implements ElectionRepository {
  constructor(private readonly pool: Pool) {}

  async opensAt(): Promise<Date | null> {
    const { rows } = await this.pool.query<{ opens_at: Date }>('SELECT opens_at FROM election WHERE id = 1');
    return rows[0] ? new Date(rows[0].opens_at) : null;
  }
}
