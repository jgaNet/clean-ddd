import { UserExceptions } from './UserExceptions';

export class UserEmail {
  #value: string;

  validate(email: string) {
    const mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!email.match(mailformat)) {
      throw UserExceptions.InvalidUserEmail({ email });
    }
  }

  constructor(email: string) {
    this.validate(email);
    this.#value = email;
  }

  get value(): string {
    return this.#value;
  }

  get username(): string {
    const username = this.#value.match(/^([^@]*)@/);
    if (!username) {
      throw UserExceptions.InvalidUserEmail({ email: this.#value });
    }
    return username[1];
  }
}
