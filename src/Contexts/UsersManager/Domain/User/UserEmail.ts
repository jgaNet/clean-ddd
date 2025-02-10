import { ValueObject } from '@Primitives/ValueObject';
import { UserExceptions } from '@Contexts/UsersManager/Domain/User/UserExceptions';

export class UserEmail extends ValueObject<string> {
  constructor(email: string) {
    super(email);
    this.validate(email);
  }

  validate(email: string) {
    const mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!email.match(mailformat)) {
      throw UserExceptions.InvalidUserEmail({ email });
    }

    if (email.length > 30) {
      throw UserExceptions.InvalidUserEmail({ email });
    }
  }

  get username(): string {
    const username = this.value.match(/^([^@]*)@/);
    if (!username) {
      throw UserExceptions.InvalidUserEmail({ email: this.value });
    }
    return username[1];
  }
}
