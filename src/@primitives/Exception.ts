export abstract class Exception extends Error {
  service: string;
  type: string;
  message!: string;
  constructor({ service, type, message }: { service: string; type: string; message: string }) {
    super();
    this.type = type;
    this.service = service;
    this.message = message;
  }
}
