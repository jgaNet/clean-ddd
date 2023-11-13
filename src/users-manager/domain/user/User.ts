import { Entity } from '@primitives/Entity';
import { UserDTO } from './dtos';
import { UserProfile } from './UserProfile';
import { UserId } from './UserId';

export class User extends Entity {
  #profile: UserProfile;

  static create(userDto: UserDTO) {
    return new User(new UserId(userDto._id), new UserProfile(userDto.profile));
  }

  private constructor(_id: UserId, profile: UserProfile) {
    super(_id.value);
    this.#profile = profile;
  }

  get profile(): UserProfile {
    return this.#profile;
  }
}
