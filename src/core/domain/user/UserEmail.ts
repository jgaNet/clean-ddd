import { UserExceptions } from './UserExceptions';

export class UserEmail {
  #value: string;

  validate(email: string) {
    const mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!email.match(mailformat)) {
      throw UserExceptions.InvalidUserEmail;
    }
  }

  constructor(email: string) {
    this.validate(email);
    this.#value = email;
  }

  get value() {
    return this.#value;
  }
}
