import { Exception } from '@Architecture/Domain';

/**
 * The rules the legacy refused with a status code and `{ error }`, each with a name a client can
 * act on. The compatibility wire maps each name back to the legacy's status and sentence.
 */
export class LinkDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'Links', type, message, context });
  }
}

export class BlankLinkTitleException extends LinkDomainException {
  constructor() {
    super({ type: 'BlankLinkTitle', message: 'A link needs a title' });
  }
}

export class LinkTitleTooLongException extends LinkDomainException {
  constructor(maxLength: number, actualLength: number) {
    super({
      type: 'LinkTitleTooLong',
      message: `A link title cannot exceed ${maxLength} characters`,
      context: { maxLength, actualLength },
    });
  }
}

export class InvalidLinkUrlException extends LinkDomainException {
  constructor(url: string) {
    super({ type: 'InvalidLinkUrl', message: 'A link points at an http:// or https:// address', context: { url } });
  }
}

export class LinkNotFoundException extends LinkDomainException {
  constructor(linkId: string) {
    super({ type: 'LinkNotFound', message: 'Link not found', context: { linkId } });
  }
}

export class LinkAlreadyArchivedException extends LinkDomainException {
  constructor(linkId: string) {
    super({ type: 'LinkAlreadyArchived', message: 'This link is already archived', context: { linkId } });
  }
}
