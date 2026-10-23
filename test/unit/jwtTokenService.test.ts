import { JwtTokenService, Principal } from '../../src/auth/tokenService';

const principal: Principal = { userId: 5, role: 'VOTER', districtId: 'CM-1' };

describe('JwtTokenService', () => {
  // Time is a dependency too. The library (jsonwebtoken) reads the real clock and I cannot inject a Clock
  // into it, so I use Jest fake timers instead of waiting for a real minute.
  afterEach(() => {
    jest.useRealTimers();
  });

  it('verifies a token it issued and returns the same principal', () => {
    const service = new JwtTokenService('secret');

    const token = service.issue(principal);

    expect(service.verify(token)).toEqual(principal);
  });

  it('rejects a token signed with another secret', () => {
    const token = new JwtTokenService('secret-A').issue(principal);

    const result = new JwtTokenService('secret-B').verify(token);

    expect(result).toBeNull();
  });

  it('rejects a string that is not a token at all', () => {
    expect(new JwtTokenService('secret').verify('not-a-jwt')).toBeNull();
  });

  describe('when the token lifetime is 60 seconds', () => {
    it('still accepts the token 59 seconds after it was issued', () => {
      jest.useFakeTimers({ now: new Date('2026-10-03T09:00:00+07:00') });
      const service = new JwtTokenService('secret', 60);
      const token = service.issue(principal);

      jest.setSystemTime(new Date('2026-10-03T09:00:59+07:00'));

      expect(service.verify(token)).toEqual(principal);
    });

    it('rejects the token 61 seconds after it was issued', () => {
      jest.useFakeTimers({ now: new Date('2026-10-03T09:00:00+07:00') });
      const service = new JwtTokenService('secret', 60);
      const token = service.issue(principal);

      jest.setSystemTime(new Date('2026-10-03T09:01:01+07:00'));

      expect(service.verify(token)).toBeNull();
    });
  });
});
