import { User } from '@Contexts/UsersManager/Domain/User/User';
import { Mapper } from '@Primitives/Mapper';
import { UserDTO } from '@Contexts/UsersManager/Domain/User/DTOs';

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
