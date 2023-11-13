import { UserEmail } from './UserEmail';
import { UserProfileDTO } from './dtos';
import { ValueObject } from '@primitives/ValueObject';

interface UserProfileProps {
  email: UserEmail;
  nickname: string;
}

export class UserProfile extends ValueObject<UserProfileProps> {
  constructor(userProfileDTO: UserProfileDTO) {
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
