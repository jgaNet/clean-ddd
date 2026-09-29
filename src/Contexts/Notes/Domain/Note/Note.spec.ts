import { Id } from '@SharedKernel/Domain/ValueObjects';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';
import {
  NoteCreatedEvent,
  NoteEditedEvent,
  NoteArchivedEvent,
  NoteRestoredEvent,
  NotePinnedEvent,
  NoteUnpinnedEvent,
  NoteSharedEvent,
} from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import {
  BlankNoteTitleException,
  CannotShareWithSelfException,
  NotNoteOwnerException,
  NoteAlreadyArchivedException,
  NoteAlreadyPinnedException,
  NoteAlreadySharedException,
  NoteArchivedException,
  NoteNotArchivedException,
  NoteNotPinnedException,
} from '@Contexts/Notes/Domain/Note/NoteExceptions';

const owner = new Id('alice');
const stranger = new Id('bob');

function aNote(): Note {
  const note = Note.create({ ownerId: owner.value, title: 'Groceries', content: 'Milk, eggs' });
  if (note.isFailure()) throw note.error;
  note.data.pullDomainEvents();
  return note.data;
}

function anArchivedNote(): Note {
  const note = aNote();
  note.archive(owner);
  note.pullDomainEvents();
  return note;
}

describe('Note', () => {
  describe('writing a note', () => {
    it('picks its own identity, starts active, unpinned, unshared, and records NoteCreated', () => {
      const result = Note.create({ ownerId: 'alice', title: 'Groceries', content: 'Milk' });

      expect(result.isSuccess()).toBe(true);
      const note = result.data as Note;
      expect(note._id.value).toEqual(expect.any(String));
      expect(note.status).toBe(NoteStatus.ACTIVE);
      expect(note.pinned).toBe(false);
      expect(note.sharedWith).toEqual([]);
      expect(note.pullDomainEvents()).toEqual([
        NoteCreatedEvent.set({ noteId: note._id.value, ownerId: 'alice', title: 'Groceries' }),
      ]);
    });

    it('gives every note a distinct identity', () => {
      const first = Note.create({ ownerId: 'alice', title: 'A', content: '' });
      const second = Note.create({ ownerId: 'alice', title: 'B', content: '' });

      expect(first.data?._id.value).not.toEqual(second.data?._id.value);
    });

    it('refuses a blank title', () => {
      const result = Note.create({ ownerId: 'alice', title: '', content: 'Milk' });

      expect(result.isFailure()).toBe(true);
      expect(result.error).toBeInstanceOf(BlankNoteTitleException);
    });
  });

  describe('editing a note', () => {
    it('changes title and content and records NoteEdited', () => {
      const note = aNote();

      const result = note.edit(owner, { title: 'Shopping', content: 'Bread' });

      expect(result.isSuccess()).toBe(true);
      expect(note.title).toBe('Shopping');
      expect(note.content).toBe('Bread');
      expect(note.pullDomainEvents()).toEqual([NoteEditedEvent.set({ noteId: note._id.value, title: 'Shopping' })]);
    });

    it('is reserved to the owner', () => {
      const note = aNote();

      const result = note.edit(stranger, { title: 'Hacked', content: '' });

      expect(result.error).toBeInstanceOf(NotNoteOwnerException);
      expect(note.title).toBe('Groceries');
    });

    it('is refused on an archived note', () => {
      const note = anArchivedNote();

      const result = note.edit(owner, { title: 'Shopping', content: 'Bread' });

      expect(result.error).toBeInstanceOf(NoteArchivedException);
    });

    it('keeps the previous title when the new one is invalid', () => {
      const note = aNote();

      const result = note.edit(owner, { title: '   ', content: 'Bread' });

      expect(result.error).toBeInstanceOf(BlankNoteTitleException);
      expect(note.title).toBe('Groceries');
      expect(note.content).toBe('Milk, eggs');
    });
  });

  describe('archiving and restoring', () => {
    it('archives an active note and records NoteArchived', () => {
      const note = aNote();

      expect(note.archive(owner).isSuccess()).toBe(true);
      expect(note.status).toBe(NoteStatus.ARCHIVED);
      expect(note.pullDomainEvents()).toEqual([NoteArchivedEvent.set({ noteId: note._id.value })]);
    });

    it('cannot archive twice', () => {
      const note = anArchivedNote();

      expect(note.archive(owner).error).toBeInstanceOf(NoteAlreadyArchivedException);
    });

    it('restores an archived note and records NoteRestored', () => {
      const note = anArchivedNote();

      expect(note.restore(owner).isSuccess()).toBe(true);
      expect(note.status).toBe(NoteStatus.ACTIVE);
      expect(note.pullDomainEvents()).toEqual([NoteRestoredEvent.set({ noteId: note._id.value })]);
    });

    it('cannot restore an active note', () => {
      const note = aNote();

      expect(note.restore(owner).error).toBeInstanceOf(NoteNotArchivedException);
    });

    it('is reserved to the owner', () => {
      const note = aNote();

      expect(note.archive(stranger).error).toBeInstanceOf(NotNoteOwnerException);
      expect(note.status).toBe(NoteStatus.ACTIVE);
    });
  });

  describe('pinning and unpinning', () => {
    it('pins an active note and records NotePinned', () => {
      const note = aNote();

      expect(note.pin(owner).isSuccess()).toBe(true);
      expect(note.pinned).toBe(true);
      expect(note.pullDomainEvents()).toEqual([NotePinnedEvent.set({ noteId: note._id.value })]);
    });

    it('cannot pin twice', () => {
      const note = aNote();
      note.pin(owner);

      expect(note.pin(owner).error).toBeInstanceOf(NoteAlreadyPinnedException);
    });

    it('cannot pin an archived note', () => {
      const note = anArchivedNote();

      expect(note.pin(owner).error).toBeInstanceOf(NoteArchivedException);
      expect(note.pinned).toBe(false);
    });

    it('unpins a pinned note and records NoteUnpinned', () => {
      const note = aNote();
      note.pin(owner);
      note.pullDomainEvents();

      expect(note.unpin(owner).isSuccess()).toBe(true);
      expect(note.pinned).toBe(false);
      expect(note.pullDomainEvents()).toEqual([NoteUnpinnedEvent.set({ noteId: note._id.value })]);
    });

    it('cannot unpin a note that is not pinned', () => {
      const note = aNote();

      expect(note.unpin(owner).error).toBeInstanceOf(NoteNotPinnedException);
    });

    it('can unpin a note that was archived while pinned', () => {
      const note = aNote();
      note.pin(owner);
      note.archive(owner);

      expect(note.unpin(owner).isSuccess()).toBe(true);
      expect(note.pinned).toBe(false);
    });

    it('is reserved to the owner', () => {
      const note = aNote();

      expect(note.pin(stranger).error).toBeInstanceOf(NotNoteOwnerException);
      expect(note.pinned).toBe(false);

      note.pin(owner);
      expect(note.unpin(stranger).error).toBeInstanceOf(NotNoteOwnerException);
      expect(note.pinned).toBe(true);
    });
  });

  describe('sharing', () => {
    it('shares with another account and records NoteShared', () => {
      const note = aNote();

      const result = note.shareWith(owner, stranger);

      expect(result.isSuccess()).toBe(true);
      expect(note.sharedWith).toEqual(['bob']);
      expect(note.isVisibleTo(stranger)).toBe(true);
      expect(note.pullDomainEvents()).toEqual([
        NoteSharedEvent.set({ noteId: note._id.value, title: 'Groceries', ownerId: 'alice', recipientId: 'bob' }),
      ]);
    });

    it('cannot share with yourself', () => {
      const note = aNote();

      expect(note.shareWith(owner, owner).error).toBeInstanceOf(CannotShareWithSelfException);
    });

    it('cannot share twice with the same account', () => {
      const note = aNote();
      note.shareWith(owner, stranger);

      expect(note.shareWith(owner, stranger).error).toBeInstanceOf(NoteAlreadySharedException);
      expect(note.sharedWith).toEqual(['bob']);
    });

    it('cannot share an archived note', () => {
      const note = anArchivedNote();

      expect(note.shareWith(owner, stranger).error).toBeInstanceOf(NoteArchivedException);
    });

    it('is reserved to the owner', () => {
      const note = aNote();

      expect(note.shareWith(stranger, new Id('carol')).error).toBeInstanceOf(NotNoteOwnerException);
    });
  });

  describe('persistence round-trip', () => {
    it('rebuilds the full state from a snapshot without recording any event', () => {
      const note = Note.fromSnapshot({
        _id: 'note-9',
        ownerId: 'alice',
        title: 'Old',
        content: 'Text',
        status: NoteStatus.ARCHIVED,
        pinned: true,
        sharedWith: ['bob'],
      });

      expect(note._id.value).toBe('note-9');
      expect(note.status).toBe(NoteStatus.ARCHIVED);
      expect(note.pinned).toBe(true);
      expect(note.sharedWith).toEqual(['bob']);
      expect(note.pullDomainEvents()).toEqual([]);
    });

    it('gives back an equal note after toSnapshot / fromSnapshot', () => {
      const note = aNote();
      note.shareWith(owner, stranger);
      note.pin(owner);

      const rebuilt = Note.fromSnapshot(note.toSnapshot());

      expect(rebuilt.equals(note)).toBe(true);
      expect(rebuilt.toSnapshot()).toEqual(note.toSnapshot());
    });

    it('refuses a corrupted snapshot', () => {
      expect(() =>
        Note.fromSnapshot({
          _id: 'n',
          ownerId: 'alice',
          title: '',
          content: '',
          status: NoteStatus.ACTIVE,
          pinned: false,
          sharedWith: [],
        }),
      ).toThrow(/Corrupted note n/);
    });
  });
});
