// Test Data Builders. A test says only what matters to it:
//   aVoter().inDistrict('CM-2')
// and the builder fills in everything else with believable (faker) data.
import { faker, fakerTH } from '@faker-js/faker';
import { Role } from '../../src/domain/types';
import { NewCandidate } from '../../src/repositories/candidateRepository';
import { NewParty } from '../../src/repositories/partyRepository';
import { Registration } from '../../src/services/accountService';
import { aValidNationalId } from './nationalIds';

export interface UserData {
  nationalId: string;
  password: string;
  firstName: string;
  lastName: string;
  address: string;
  districtId: string;
  role: Role;
}

/** Every `withXxx` returns a new builder, so a shared builder can never be changed by another test. */
export class UserBuilder {
  private constructor(private readonly data: UserData) {}

  static of(role: Role): UserBuilder {
    return new UserBuilder({
      nationalId: aValidNationalId(),
      password: faker.internet.password({ length: 12 }),
      firstName: fakerTH.person.firstName(),
      lastName: fakerTH.person.lastName(),
      address: fakerTH.location.streetAddress(),
      districtId: 'CM-1',
      role,
    });
  }

  inDistrict(districtId: string): UserBuilder {
    return new UserBuilder({ ...this.data, districtId });
  }

  withNationalId(nationalId: string): UserBuilder {
    return new UserBuilder({ ...this.data, nationalId });
  }

  withPassword(password: string): UserBuilder {
    return new UserBuilder({ ...this.data, password });
  }

  named(firstName: string, lastName: string): UserBuilder {
    return new UserBuilder({ ...this.data, firstName, lastName });
  }

  build(): UserData {
    return { ...this.data };
  }

  /** The body of `POST /auth/register` (or `AccountService.register`) for this user. */
  buildRegistration(): Registration {
    const { role: _role, ...registration } = this.data;
    return registration;
  }
}

export const aVoter = () => UserBuilder.of('VOTER');
export const aCommissioner = () => UserBuilder.of('COMMISSIONER');
export const anAdmin = () => UserBuilder.of('ADMIN');
export const aRegistration = (): Registration => aVoter().buildRegistration();

export class PartyBuilder {
  private constructor(private readonly data: NewParty) {}

  static create(): PartyBuilder {
    return new PartyBuilder({
      // random suffix keeps names unique when a test creates several parties
      name: `Party ${faker.string.alphanumeric(8)}`,
      logoUrl: null,
      policy: faker.lorem.sentence(),
    });
  }

  named(name: string): PartyBuilder {
    return new PartyBuilder({ ...this.data, name });
  }

  build(): NewParty {
    return { ...this.data };
  }
}

export const aParty = () => PartyBuilder.create();

export class CandidateBuilder {
  private constructor(private readonly data: NewCandidate) {}

  static create(): CandidateBuilder {
    return new CandidateBuilder({
      districtId: 'CM-1',
      partyId: 1,
      number: 1,
      firstName: fakerTH.person.firstName(),
      lastName: fakerTH.person.lastName(),
      photoUrl: null,
    });
  }

  inDistrict(districtId: string): CandidateBuilder {
    return new CandidateBuilder({ ...this.data, districtId });
  }

  forParty(partyId: number): CandidateBuilder {
    return new CandidateBuilder({ ...this.data, partyId });
  }

  numbered(number: number): CandidateBuilder {
    return new CandidateBuilder({ ...this.data, number });
  }

  build(): NewCandidate {
    return { ...this.data };
  }
}

export const aCandidate = () => CandidateBuilder.create();
