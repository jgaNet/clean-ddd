import { ReactionEmoji } from '@Contexts/Notes/Domain/NoteReaction/ReactionEmoji';
import { UnsupportedReactionEmojiException } from '@Contexts/Notes/Domain/NoteReaction/NoteReactionExceptions';

describe('ReactionEmoji', () => {
  it('accepts an emoji the product supports, trimmed', () => {
    const emoji = ReactionEmoji.create(' 👍 ');

    expect(emoji.isSuccess()).toBe(true);
    expect(emoji.data?.value).toBe('👍');
  });

  it('refuses anything else, and says what is allowed', () => {
    const emoji = ReactionEmoji.create('🦄');

    expect(emoji.error).toBeInstanceOf(UnsupportedReactionEmojiException);
    expect(emoji.error?.context).toEqual({ emoji: '🦄', allowed: ReactionEmoji.ALLOWED });
  });

  it('refuses a word and an empty string', () => {
    expect(ReactionEmoji.create('love').isFailure()).toBe(true);
    expect(ReactionEmoji.create('').isFailure()).toBe(true);
  });

  it('is equal to another of the same emoji', () => {
    const one = ReactionEmoji.create('❤️');
    const same = ReactionEmoji.create('❤️');
    const other = ReactionEmoji.create('🎉');

    expect(one.data?.equals(same.data as ReactionEmoji)).toBe(true);
    expect(one.data?.equals(other.data as ReactionEmoji)).toBe(false);
  });
});
