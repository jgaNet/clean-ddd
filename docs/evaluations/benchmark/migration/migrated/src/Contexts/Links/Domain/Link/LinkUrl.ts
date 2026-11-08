import { IResult, Result, ValueObject } from '@Architecture/Domain';

import { InvalidLinkUrlException } from '@Contexts/Links/Domain/Link/LinkExceptions';

/** A link points at an http(s) address; the legacy asked for nothing more, and neither does this. */
export class LinkUrl extends ValueObject<string> {
  private constructor(url: string) {
    super(url);
  }

  static create(raw: string): IResult<LinkUrl> {
    if (!/^https?:\/\//.test(raw)) return Result.fail(new InvalidLinkUrlException(raw));
    return Result.ok(new LinkUrl(raw));
  }
}
