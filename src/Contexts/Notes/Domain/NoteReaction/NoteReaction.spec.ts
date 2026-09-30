import { Id } from '@Architecture/Domain';

import { NoteReaction } from '@Contexts/Notes/Domain/NoteReaction/NoteReaction';
import {
  NoteReactedEvent,
  NoteReactionChangedEvent,
} from '@Contexts/Notes/Domain/NoteReaction/Events/NoteReactionEvents';
import {
  NotYourReactionException,
  ReactionUnchangedException,
  UnsupportedReactionEmojiException,
} from '@Contexts/Notes/Domain/NoteReaction/NoteReactionExceptions';

const bob = new Id('bob');
const carol = new Id('carol');
const at = new Date('2026-01-01T10:00:00.000Z');

function aReaction(emoji = '👍', firstOnNote = true): NoteReaction {
  const reaction = NoteReaction.create({ noteId: 'note-1', reactorId: bob.value, emoji, firstOnNote }, at);
  if (reaction.isFailure()) throw reaction.error;
  reaction.data.pullDomainEvents();
  return reaction.data;
}

describe('NoteReaction', () => {
  describe('reacting', () => {
    it('picks its own identity, keeps the moment it was given, and records NoteReacted', () => {
      const result = NoteReaction.create({ noteId: 'note-1', reactorId: 'bob', emoji: '👍', firstOnNote: true }, at);

      expect(result.isSuccess()).toBe(true);
      const reaction = result.data as NoteReaction;
      expect(reaction._id.value).toEqual(expect.any(String));
      expect(reaction.emoji).toBe('👍');
      expect(reaction.reactedAt).toEqual(at);
      expect(reaction.pullDomainEvents()).toEqual([
        NoteReactedEvent.set({
          reactionId: reaction._id.value,
          noteId: 'note-1',
          reactorId: 'bob',
          emoji: '👍',
          firstOnNote: true,
        }),
      ]);
    });

    it('says on the event when the note had already been reacted to', () => {
      const reaction = NoteReaction.create(
        { noteId: 'note-1', reactorId: 'carol', emoji: '🎉', firstOnNote: false },
        at,
      );

      const recorded = reaction.data?.pullDomainEvents() ?? [];
      expect(recorded[0].payload).toEqual({
        reactionId: expect.any(String),
        noteId: 'note-1',
        reactorId: 'carol',
        emoji: '🎉',
        firstOnNote: false,
      });
    });

    it('refuses an emoji the product does not support', () => {
      const result = NoteReaction.create({ noteId: 'note-1', reactorId: 'bob', emoji: '🦄', firstOnNote: true });

      expect(result.error).toBeInstanceOf(UnsupportedReactionEmojiException);
    });
  });

  describe('changing a reaction', () => {
    it('replaces the emoji, keeps the date, and records NoteReactionChanged', () => {
      const reaction = aReaction('👍');

      const result = reaction.changeTo(bob, '😂');

      expect(result.isSuccess()).toBe(true);
      expect(reaction.emoji).toBe('😂');
      expect(reaction.reactedAt).toEqual(at);
      expect(reaction.pullDomainEvents()).toEqual([
        NoteReactionChangedEvent.set({
          reactionId: reaction._id.value,
          noteId: 'note-1',
          reactorId: 'bob',
          emoji: '😂',
        }),
      ]);
    });

    it('is reserved to the person who reacted', () => {
      const reaction = aReaction('👍');

      expect(reaction.changeTo(carol, '😂').error).toBeInstanceOf(NotYourReactionException);
      expect(reaction.emoji).toBe('👍');
    });

    it('refuses the emoji already there, so nothing is recorded for nothing', () => {
      const reaction = aReaction('👍');

      expect(reaction.changeTo(bob, '👍').error).toBeInstanceOf(ReactionUnchangedException);
      expect(reaction.pullDomainEvents()).toEqual([]);
    });

    it('keeps the previous emoji when the new one is unsupported', () => {
      const reaction = aReaction('👍');

      expect(reaction.changeTo(bob, '🦄').error).toBeInstanceOf(UnsupportedReactionEmojiException);
      expect(reaction.emoji).toBe('👍');
    });
  });

  describe('persistence round-trip', () => {
    it('rebuilds the full state from a snapshot without recording any event', () => {
      const reaction = NoteReaction.fromSnapshot({
        _id: 'reaction-9',
        noteId: 'note-1',
        reactorId: 'bob',
        emoji: '🎉',
        reactedAt: at,
        version: 4,
      });

      expect(reaction._id.value).toBe('reaction-9');
      expect(reaction.noteId.value).toBe('note-1');
      expect(reaction.reactorId.value).toBe('bob');
      expect(reaction.emoji).toBe('🎉');
      expect(reaction.version).toBe(4);
      expect(reaction.pullDomainEvents()).toEqual([]);
    });

    it('gives back an equal reaction after toSnapshot / fromSnapshot', () => {
      const reaction = aReaction('❤️');

      const rebuilt = NoteReaction.fromSnapshot(reaction.toSnapshot());

      expect(rebuilt.equals(reaction)).toBe(true);
      expect(rebuilt.toSnapshot()).toEqual(reaction.toSnapshot());
    });

    it('refuses a corrupted snapshot', () => {
      expect(() =>
        NoteReaction.fromSnapshot({
          _id: 'r',
          noteId: 'note-1',
          reactorId: 'bob',
          emoji: 'not an emoji',
          reactedAt: at,
          version: 1,
        }),
      ).toThrow(/Corrupted note reaction r/);
    });
  });
});
