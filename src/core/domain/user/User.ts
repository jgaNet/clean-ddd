import { UserEmail } from './UserEmail';
import { UserId } from './UserId';

export interface UserProps {
  email: string;
}

export class User {
  #_id: UserId;
  #email: UserEmail;

  constructor(_id: UserId, props: UserProps) {
    this.#_id = _id;
    this.#email = new UserEmail(props.email);
  }

  get _id(): string | undefined {
    return this.#_id.value;
  }

  get email(): string {
    return this.#email.value;
  }
}
