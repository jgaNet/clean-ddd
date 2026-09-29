import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { NoteCreation } from '@Contexts/Notes/Domain/Note/NoteCreation';
import { AccountPlan, IAccountDirectory } from '@Contexts/Notes/Domain/Note/Ports/IAccountDirectory';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { BlankNoteTitleException, NoteLimitReachedException } from '@Contexts/Notes/Domain/Note/NoteExceptions';

/** A domain test needs only the ports: a plan per account, and a Map of notes. */
const directoryWith = (plans: Record<string, AccountPlan>): IAccountDirectory => ({
  exists: async id => id in plans,
  planOf: async id => plans[id] ?? AccountPlan.FREE,
});

class FakeNoteRepository implements INoteRepository {
  #notes = new Map<string, Note>();

  async findById(id: string) {
    return this.#notes.get(id) ?? null;
  }
  async save(note: Note) {
    this.#notes.set(note._id.value, note);
  }
  async countByOwner(ownerId: string) {
    return [...this.#notes.values()].filter(note => note.ownerId.value === ownerId).length;
  }
}

const aNoteFor = (ownerId: string) => ({ ownerId, title: 'Groceries', content: 'Milk' });

describe('NoteCreation (domain service)', () => {
  let repository: FakeNoteRepository;
  let creation: NoteCreation;

  beforeEach(() => {
    repository = new FakeNoteRepository();
    creation = new NoteCreation(directoryWith({ alice: AccountPlan.FREE, bob: AccountPlan.PRO }), repository);
  });

  async function saveNotesOf(ownerId: string, count: number) {
    for (let i = 0; i < count; i++) {
      const note = await creation.create(aNoteFor(ownerId));
      if (note.isFailure()) throw note.error;
      await repository.save(note.data);
    }
  }

  it('writes a note for an account under the free limit', async () => {
    await saveNotesOf('alice', NoteCreation.FREE_PLAN_NOTE_LIMIT - 1);

    const result = await creation.create(aNoteFor('alice'));

    expect(result.isSuccess()).toBe(true);
    expect(result.data?.ownerId.value).toBe('alice');
  });

  it('refuses the eleventh note of an account on the free plan', async () => {
    await saveNotesOf('alice', NoteCreation.FREE_PLAN_NOTE_LIMIT);

    const result = await creation.create(aNoteFor('alice'));

    expect(result.error).toBeInstanceOf(NoteLimitReachedException);
    expect(await repository.countByOwner('alice')).toBe(NoteCreation.FREE_PLAN_NOTE_LIMIT);
  });

  it('never limits an account on the pro plan', async () => {
    await saveNotesOf('bob', NoteCreation.FREE_PLAN_NOTE_LIMIT);

    const result = await creation.create(aNoteFor('bob'));

    expect(result.isSuccess()).toBe(true);
  });

  it("counts each owner's notes, not everyone's", async () => {
    await saveNotesOf('bob', NoteCreation.FREE_PLAN_NOTE_LIMIT);

    const result = await creation.create(aNoteFor('alice'));

    expect(result.isSuccess()).toBe(true);
  });

  it('treats an account the directory does not know as free', async () => {
    await saveNotesOf('carol', NoteCreation.FREE_PLAN_NOTE_LIMIT);

    const result = await creation.create(aNoteFor('carol'));

    expect(result.error).toBeInstanceOf(NoteLimitReachedException);
  });

  it("still leaves the note's own rules to the aggregate", async () => {
    const result = await creation.create({ ...aNoteFor('alice'), title: '   ' });

    expect(result.error).toBeInstanceOf(BlankNoteTitleException);
  });
});
