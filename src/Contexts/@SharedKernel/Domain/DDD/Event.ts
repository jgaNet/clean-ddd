/**
 * Event: a named, immutable payload. Every message in the system is one.
 *
 * - Commands (CommandEvent) ask for something to happen: `CreateNoteCommandEvent`
 * - Domain events (DomainEvent) state that something happened inside a context: `NoteArchivedEvent`
 * - Integration events (IntegrationEvent) tell other contexts about it: `NoteSharedIntegrationEvent`
 *
 * The name defaults to the class name, which is also the channel the event bus routes on.
 * Create one with `MyEvent.set(payload)`.
 */

export type IEvent<PayloadDTO> = {
  payload: PayloadDTO;
  name?: string;
};

export class Event<PayloadDTO> {
  #payload: PayloadDTO;
  #name: string;

  constructor({ payload, name }: IEvent<PayloadDTO>) {
    this.#payload = payload;
    this.#name = name || this.constructor.name;
  }

  /** Builds an instance of the calling class (not of Event), so `instanceof` and the name both hold. */
  static set<PayloadDTO>(
    this: new (event: IEvent<PayloadDTO>) => Event<PayloadDTO>,
    payload: PayloadDTO,
  ): Event<PayloadDTO> {
    return new this({ payload });
  }

  get payload(): PayloadDTO {
    return this.#payload;
  }

  get name(): string {
    return this.#name;
  }
}
