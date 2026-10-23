import { faker } from '@faker-js/faker';

/** A random 13-digit Thai national id whose last digit is a correct checksum. */
export function aValidNationalId(): string {
  const first12 = Array.from({ length: 12 }, (_, i) => faker.number.int({ min: i === 0 ? 1 : 0, max: 9 }));
  const sum = first12.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
  const checksum = (11 - (sum % 11)) % 10;
  return [...first12, checksum].join('');
}

/** Same id but with the checksum digit moved by one, so it is always invalid. */
export function anInvalidNationalId(): string {
  const id = aValidNationalId();
  const wrongChecksum = (Number(id[12]) + 1) % 10;
  return id.slice(0, 12) + wrongChecksum;
}
