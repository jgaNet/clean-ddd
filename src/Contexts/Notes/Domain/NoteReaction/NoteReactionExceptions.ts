import { Exception } from '@Architecture/Domain';

/**
 * The rules a reaction protects, in business words. Like every domain exception here they are
 * values carried by Result.fail(), never thrown. The rules about who may react to a note at all
 * live with the Note, and so do their exceptions (NoteExceptions.ts).
 */
export class NoteReactionDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'Notes', type, message, context });
  }
}

export class UnsupportedReactionEmojiException extends NoteReactionDomainException {
  constructor(emoji: string, allowed: readonly string[]) {
    super({
      type: 'UnsupportedReactionEmoji',
      message: `A reaction is one of ${allowed.join(' ')}`,
      context: { emoji, allowed },
    });
  }
}

export class NotYourReactionException extends NoteReactionDomainException {
  constructor(reactionId: string, actorId: string) {
    super({
      type: 'NotYourReaction',
      message: 'Only the person who reacted can change that reaction',
      context: { reactionId, actorId },
    });
  }
}

export class ReactionUnchangedException extends NoteReactionDomainException {
  constructor(reactionId: string, emoji: string) {
    super({
      type: 'ReactionUnchanged',
      message: 'You already reacted with that emoji',
      context: { reactionId, emoji },
    });
  }
}
