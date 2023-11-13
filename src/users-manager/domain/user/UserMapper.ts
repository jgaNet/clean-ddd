import { User } from './User';
import { Mapper } from '@primitives/Mapper';
import { UserDTO } from './dtos';

export class UserMapperImpl implements Mapper<User, UserDTO> {
  toJson(user: User): UserDTO {
    return {
      _id: user._id,
      profile: {
        email: user.profile.email.value,
        nickname: user.profile.nickname,
      },
    };
  }

  toEntity(user: UserDTO): User {
    return User.create(user);
  }
}

export const UserMapper = new UserMapperImpl();
