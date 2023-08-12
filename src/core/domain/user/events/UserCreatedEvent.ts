const NAME = 'UserCreated';

export type UserCreatedPayloadDTO = {
  userId: string;
};

export class UserCreatedEvent {
  static NAME: string = NAME;

  #payload: UserCreatedPayloadDTO;

  constructor(user: UserCreatedPayloadDTO) {
    this.#payload = user;
  }

  static new(user: UserCreatedPayloadDTO): UserCreatedEvent {
    return new UserCreatedEvent(user);
  }

  get payload(): UserCreatedPayloadDTO {
    return this.#payload;
  }
}
