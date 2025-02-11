export class Event<PayloadDTO> {
  #payload: PayloadDTO;

  constructor(payload: PayloadDTO) {
    this.#payload = payload;
  }

  get payload(): PayloadDTO {
    return this.#payload;
  }
}
