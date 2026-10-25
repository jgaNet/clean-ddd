/**
 * Event: a named, immutable payload. Every message in the system is one.
 *
 * - Commands (CommandEvent) ask for something to happen: `CreateNoteCommandEvent`
 * - Domain events (DomainEvent) state that something happened inside a context: `NoteArchivedEvent`
 * - Integration events (IntegrationEvent) tell other contexts about it: `NoteSharedIntegrationEvent`
 *
 * The name defaults to the class name, which is also the channel the event bus routes on.
 * Create one with `MyEvent.set(payload)`.
 *
 * `payload` and `name` are public and `readonly`, not private fields behind getters: an event
 * is a value, so two events are equal when their class and their payload are, and a test that
 * writes `expect(published).toEqual([NoteSharedEvent.set({ noteId })])` must compare the
 * payload. A `#private` field is invisible to a structural comparison, so that assertion would
 * pass whatever the payload said — which it silently did until an evaluation caught it.
 */

export type IEvent<PayloadDTO> = {
  payload: PayloadDTO;
  name?: string;
};

export class Event<PayloadDTO> {
  readonly payload: PayloadDTO;
  readonly name: string;

  constructor({ payload, name }: IEvent<PayloadDTO>) {
    this.payload = payload;
    this.name = name || this.constructor.name;
  }

  /** Builds an instance of the calling class (not of Event), so `instanceof` and the name both hold. */
  static set<PayloadDTO>(
    this: new (event: IEvent<PayloadDTO>) => Event<PayloadDTO>,
    payload: PayloadDTO,
  ): Event<PayloadDTO> {
    return new this({ payload });
  }
}

/**
 * The name a message has outside the process — on an operation record, in a completion notice:
 * its intent or its fact, without the suffix that names its kind here (`ShareNote`, `NoteShared`,
 * `OperationComplete`). The bus keeps routing on the full name; the suffix is this codebase's
 * naming convention, and every language of the reference answers the same API (API-ONE-SURFACE).
 */
export function publicName(event: { name: string }): string {
  return event.name.replace(/(CommandEvent|IntegrationEvent|Event)$/, '');
}
