import { UserEmail } from '@Contexts/UsersManager/Domain/User/UserEmail';
import { IUserProfile } from '@Contexts/UsersManager/Domain/User/DTOs';
import { ValueObject } from '@Primitives/ValueObject';

interface UserProfileProps {
  email: UserEmail;
  nickname: string;
}

export class UserProfile extends ValueObject<UserProfileProps> {
  constructor(userProfileDTO: IUserProfile) {
    const email = new UserEmail(userProfileDTO.email);
    super({
      email,
      nickname: userProfileDTO.nickname || email.username,
    });
  }

  get nickname(): string {
    return this.value.nickname;
  }

  get email(): UserEmail {
    return this.value.email;
  }
}
