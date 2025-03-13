import { ValueObject } from '@Primitives/DDD';
import { InvalidUserEmail } from '@Contexts/Users/Domain/User/UserExceptions';

export class UserEmail extends ValueObject<string> {
  constructor(email: string) {
    super(email);
    this.validate(email);
  }

  validate(email: string) {
    const mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!email.match(mailformat)) {
      throw new InvalidUserEmail({ email });
    }

    if (email.length > 30) {
      throw new InvalidUserEmail({ email });
    }
  }

  get username(): string {
    const username = this.value.match(/^([^@]*)@/);
    if (!username) {
      throw new InvalidUserEmail({ email: this.value });
    }
    return username[1];
  }
}
