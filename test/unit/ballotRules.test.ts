import { whyBallotIsClosed } from '../../src/domain/ballotRules';

// SPROUT: the new rule ("no voting after the poll is closed") was written as a small, pure function with its own tests,
// instead of adding more `if`s in the middle of the legacy handler. These are plain unit tests, no database.
describe('whyBallotIsClosed', () => {
  const opensAt = new Date('2026-10-04T09:00:00.000Z');
  const closedAt = new Date('2026-10-04T15:00:00.000Z');

  describe('old rules (moved out of the handler)', () => {
    it('says the election is not open when there is no election at all', () => {
      const reason = whyBallotIsClosed({ now: opensAt, electionOpensAt: null, districtClosedAt: null });

      expect(reason).toBe('election is not open');
    });

    it('says the election is not open before the opening time', () => {
      const reason = whyBallotIsClosed({
        now: new Date('2026-10-04T08:59:59.999Z'),
        electionOpensAt: opensAt,
        districtClosedAt: null,
      });

      expect(reason).toBe('election is not open');
    });

    it('allows voting exactly at the opening time', () => {
      const reason = whyBallotIsClosed({ now: opensAt, electionOpensAt: opensAt, districtClosedAt: null });

      expect(reason).toBeNull();
    });

    it('allows voting while the election is open and the poll is not closed', () => {
      const reason = whyBallotIsClosed({
        now: new Date('2026-10-04T12:00:00.000Z'),
        electionOpensAt: opensAt,
        districtClosedAt: null,
      });

      expect(reason).toBeNull();
    });
  });

  describe('new rule', () => {
    it('says the poll is closed once the district has been closed', () => {
      const reason = whyBallotIsClosed({
        now: new Date('2026-10-04T15:00:01.000Z'),
        electionOpensAt: opensAt,
        districtClosedAt: closedAt,
      });

      expect(reason).toBe('poll is closed');
    });

    it('keeps saying the poll is closed for the rest of time', () => {
      const reason = whyBallotIsClosed({
        now: new Date('2030-01-01T00:00:00.000Z'),
        electionOpensAt: opensAt,
        districtClosedAt: closedAt,
      });

      expect(reason).toBe('poll is closed');
    });

    it('reports "election is not open" first when both reasons apply (the original check keeps its place)', () => {
      const reason = whyBallotIsClosed({
        now: new Date('2026-10-04T08:00:00.000Z'),
        electionOpensAt: opensAt,
        districtClosedAt: closedAt,
      });

      expect(reason).toBe('election is not open');
    });
  });
});
