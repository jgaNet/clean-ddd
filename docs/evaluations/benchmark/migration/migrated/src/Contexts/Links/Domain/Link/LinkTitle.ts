import { IResult, Result, ValueObject } from '@Architecture/Domain';

import { BlankLinkTitleException, LinkTitleTooLongException } from '@Contexts/Links/Domain/Link/LinkExceptions';

/** A title is trimmed, not blank, and at most 80 characters: the rule the legacy checked where the request arrived. */
export class LinkTitle extends ValueObject<string> {
  static readonly MAX_LENGTH = 80;

  private constructor(title: string) {
    super(title);
  }

  static create(raw: string): IResult<LinkTitle> {
    const title = raw.trim();
    if (title.length === 0) return Result.fail(new BlankLinkTitleException());
    if (title.length > LinkTitle.MAX_LENGTH) {
      return Result.fail(new LinkTitleTooLongException(LinkTitle.MAX_LENGTH, title.length));
    }
    return Result.ok(new LinkTitle(title));
  }
}
