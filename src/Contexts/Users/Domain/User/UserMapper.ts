import { User } from '@Contexts/Users/Domain/User/User';
import { Mapper } from '@Primitives/Mapper';
import { IUser } from '@Contexts/Users/Domain/User/DTOs';

export class UserMapperImpl implements Mapper<User, IUser> {
  toJSON(user: User): IUser {
    return {
      _id: user._id,
      profile: {
        email: user.profile.email.value,
        nickname: user.profile.nickname,
      },
    };
  }

  toEntity(user: IUser): User {
    const userEntity = User.create(user);

    if (userEntity.isFailure()) {
      throw userEntity;
    }

    return userEntity.data;
  }
}

export const UserMapper = new UserMapperImpl();
