import { Pool } from 'pg';
import { loadConfig } from './config';

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

// One shared Pool for the running server. server.ts hands it to createApp(); no other module imports it,
// so tests build their own Pool and never touch this one.
export const pool = createPool(loadConfig().databaseUrl);
