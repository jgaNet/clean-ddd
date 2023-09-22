export abstract class Exception extends Error {
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
    super();
    this.type = type;
    this.service = service;
    this.message = message;
    this.context = context || {};
  }
}
