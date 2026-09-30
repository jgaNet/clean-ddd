import { IResult, Result, ValueObject } from '@Architecture/Domain';

import { UnsupportedReactionEmojiException } from '@Contexts/Notes/Domain/NoteReaction/NoteReactionExceptions';

/**
 * ReactionEmoji is a value object: once you hold one, it is an emoji the product supports.
 *
 * Which emojis a person may react with is a business decision, so it is taken here, in the
 * domain, and nowhere else: the route schema and the screens read this list instead of
 * repeating it, and widening it is a one-line change with no API contract to renegotiate.
 */
export class ReactionEmoji extends ValueObject<string> {
  static readonly ALLOWED = ['👍', '❤️', '😂', '🎉', '😮', '😢'] as const;

  private constructor(emoji: string) {
    super(emoji);
  }

  static create(raw: string): IResult<ReactionEmoji> {
    const emoji = raw.trim();

    if (!ReactionEmoji.ALLOWED.some(allowed => allowed === emoji)) {
      return Result.fail(new UnsupportedReactionEmojiException(raw, ReactionEmoji.ALLOWED));
    }

    return Result.ok(new ReactionEmoji(emoji));
  }
}
