import { UserDTO } from './dtos';
import { UserProfile } from './UserProfile';
import { UserId } from './UserId';

export class User {
  #_id: UserId;
  #profile: UserProfile;

  private constructor(_id: UserId, profile: UserProfile) {
    this.#_id = _id;
    this.#profile = profile;
  }

  static create(userDto: UserDTO) {
    return new User(new UserId(userDto._id), new UserProfile(userDto.profile));
  }

  get _id(): string {
    return this.#_id.value;
  }

  get profile(): UserProfile {
    return this.#profile;
  }
}
