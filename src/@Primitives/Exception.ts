export abstract class Exception {
  service: string;
  type: string;
  message!: string;
  context?: unknown;

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
}

export class UnknownException extends Exception {
  constructor(message: string, context?: unknown) {
    super({
      service: 'unknown',
      type: 'unknown',
      message,
      context,
    });
  }
}
