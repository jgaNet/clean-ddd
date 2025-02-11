import { User } from '@Contexts/UsersManager/Domain/User/User';
import { Mapper } from '@Primitives/Mapper';
import { IUser } from '@Contexts/UsersManager/Domain/User/DTOs';

export class UserMapperImpl implements Mapper<User, IUser> {
  toJson(user: User): IUser {
    return {
      _id: user._id,
      profile: {
        email: user.profile.email.value,
        nickname: user.profile.nickname,
      },
    };
  }

  toEntity(user: IUser): User {
    return User.create(user);
  }
}

export const UserMapper = new UserMapperImpl();
