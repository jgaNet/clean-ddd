/**
 * Exception describes a broken rule: which context refused (`service`), which rule
 * (`type`, a stable identifier a client can switch on), in words (`message`), with what
 * details (`context`). It is a plain value carried by `Result.fail()`, never thrown, so it
 * does not extend Error: there is no stack to capture for an expected outcome.
 *
 * Each context declares its own subclasses next to its aggregate
 * (Contexts/Notes/Domain/Note/NoteExceptions.ts); the generic ones (NotFound, NotAllowed,
 * Unknown) live in CommonExceptions.ts.
 */
export abstract class Exception {
  service: string;
  type: string;
  message!: string;
  context?: unknown;
  #isException = true;

  constructor({
    service,
    type,
    message,
    context,
  }: {
    service: string;
    type: string;
    message: string;
    context?: unknown;
  }) {
    this.type = type;
    this.service = service;
    this.message = message;
    this.context = context || {};
  }

  equals(other: Exception): boolean {
    return (
      this.service === other.service &&
      this.type === other.type &&
      this.message === other.message &&
      JSON.stringify(this.context) === JSON.stringify(other.context)
    );
  }

  get isException(): boolean {
    return this.#isException;
  }

  /** Tells an Exception from an Error or anything else, e.g. in Result.fail(). */
  static isException(obj: unknown): obj is Exception {
    return obj !== null && typeof (obj as Exception).isException !== 'undefined';
  }
}
