import { UserEmail } from './UserEmail';
import { UserProfileDTO as UserProfileProps } from './dtos';

export class UserProfile {
  #email: UserEmail;
  #nickname: string;

  constructor(userProfileProps: UserProfileProps) {
    this.#email = new UserEmail(userProfileProps.email);
    this.#nickname = userProfileProps.nickname || this.#email.username;
  }

  get nickname(): string {
    return this.#nickname;
  }

  get email(): UserEmail {
    return this.#email;
  }
}
