import { Pool } from 'pg';
import { District } from '../domain/types';

export interface DistrictRepository {
  findAll(): Promise<District[]>;
  findById(id: string): Promise<District | null>;
  /** When the poll of the district was closed, or null while it is still open. */
  closedAt(id: string): Promise<Date | null>;
  /** Closes the poll. Returns false (and changes nothing) if it was already closed. */
  close(id: string, at: Date): Promise<boolean>;
}

export class PgDistrictRepository implements DistrictRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(): Promise<District[]> {
    const { rows } = await this.pool.query<District>(
      `SELECT id, province, number FROM districts ORDER BY province, number`,
    );
    return rows;
  }

  async findById(id: string): Promise<District | null> {
    const { rows } = await this.pool.query<District>(`SELECT id, province, number FROM districts WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async closedAt(id: string): Promise<Date | null> {
    const { rows } = await this.pool.query<{ closed_at: Date | null }>(
      `SELECT closed_at FROM districts WHERE id = $1`,
      [id],
    );
    return rows[0]?.closed_at ?? null;
  }

  async close(id: string, at: Date): Promise<boolean> {
    // One statement, so two commissioners closing at the same moment cannot both succeed.
    const result = await this.pool.query(`UPDATE districts SET closed_at = $2 WHERE id = $1 AND closed_at IS NULL`, [
      id,
      at,
    ]);
    return result.rowCount === 1;
  }
}
