import { Entity } from '@Primitives/Entity';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';
import { UserProfile } from '@Contexts/UsersManager/Domain/User/UserProfile';
import { UserId } from '@Contexts/UsersManager/Domain/User/UserId';
import { Result, ResultValue } from '@Primitives/Result';

export class User extends Entity {
  #profile: UserProfile;

  static create(userDto: IUser): ResultValue<User> {
    return Result.ok(new User(new UserId(userDto._id), new UserProfile(userDto.profile)));
  }

  private constructor(_id: UserId, profile: UserProfile) {
    super(_id.value);
    this.#profile = profile;
  }

  get profile(): UserProfile {
    return this.#profile;
  }
}
