import { loadConfig } from '../../src/config';

describe('loadConfig', () => {
  describe('when the environment is empty', () => {
    it('falls back to the default values', () => {
      const config = loadConfig({});

      expect(config).toEqual({
        port: 3000,
        databaseUrl: 'postgres://election:election@localhost:5432/election_dev',
        jwtSecret: 'dev-secret',
      });
    });
  });

  describe('when the environment has values', () => {
    it('reads PORT as a number', () => {
      const config = loadConfig({ PORT: '8080' });

      expect(config.port).toBe(8080);
    });

    it('reads JWT_SECRET and DATABASE_URL as they are', () => {
      const config = loadConfig({ JWT_SECRET: 's3cret', DATABASE_URL: 'postgres://u:p@db:5432/x' });

      expect(config.jwtSecret).toBe('s3cret');
      expect(config.databaseUrl).toBe('postgres://u:p@db:5432/x');
    });
  });
});
