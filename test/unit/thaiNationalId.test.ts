import { isValidThaiNationalId } from '../../src/domain/thaiNationalId';

describe('isValidThaiNationalId', () => {
  describe('when the id is well formed', () => {
    it.each(['1509900000017', '1100000000016', '1100000000024'])('accepts "%s" because the checksum digit matches', (id) => {
      // Arrange: id comes from the table above

      // Act
      const valid = isValidThaiNationalId(id);

      // Assert
      expect(valid).toBe(true);
    });

    it('rejects an id whose checksum digit is wrong', () => {
      const id = '1509900000018'; // same as a valid id but the last digit is off by one

      const valid = isValidThaiNationalId(id);

      expect(valid).toBe(false);
    });
  });

  describe('when the id is malformed', () => {
    it.each([
      ['an empty string', ''],
      ['12 digits (too short)', '150990000001'],
      ['14 digits (too long)', '15099000000170'],
      ['letters instead of digits', 'abcdefghijklm'],
      ['a letter at the end', '150990000001x'],
      ['spaces inside', '1 50990000001 7'],
    ])('rejects %s', (_label, id) => {
      const valid = isValidThaiNationalId(id);

      expect(valid).toBe(false);
    });
  });
});
