import { ValueObject } from '@SharedKernel/Domain/DDD';
import { InvalidEmailFormat } from '@Contexts/@SharedKernel/Domain/Application/CommonExceptions';

export class Email extends ValueObject<string> {
  constructor(email: string) {
    super(email);
    this.validate(email);
  }

  validate(email: string) {
    const mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!email.match(mailformat)) {
      throw new InvalidEmailFormat({ email });
    }

    if (email.length > 30) {
      throw new InvalidEmailFormat({ email });
    }
  }

  get username(): string {
    const username = this.value.match(/^([^@]*)@/);
    if (!username) {
      throw new InvalidEmailFormat({ email: this.value });
    }
    return username[1];
  }
}
