import { Entity } from '@Primitives/Entity';
import { IUser } from '@Contexts/Users/Domain/User/DTOs';
import { UserProfile } from '@Contexts/Users/Domain/User/UserProfile';
import { UserId } from '@Contexts/Users/Domain/User/UserId';
import { Result, IResult } from '@Primitives/Result';

export class User extends Entity {
  #profile: UserProfile;

  static create(userDto: IUser): IResult<User> {
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
