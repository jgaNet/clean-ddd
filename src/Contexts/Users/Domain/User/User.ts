import { Entity } from '@Primitives/DDD';
import { Result, IResult } from '@Primitives/Application';

import { IUser } from '@Contexts/Users/Domain/User/DTOs';
import { UserId, UserProfile } from '@Contexts/Users/Domain/User';

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
