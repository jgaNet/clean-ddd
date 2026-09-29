import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { NoteCreation } from '@Contexts/Notes/Domain/Note/NoteCreation';
import { AccountPlan, IAccountPlans } from '@Contexts/Notes/Domain/Note/Ports/IAccountPlans';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { BlankNoteTitleException, NoteQuotaExceededException } from '@Contexts/Notes/Domain/Note/NoteExceptions';

/** A domain test needs only the ports: a Map is enough of a repository, a table of ids enough of the plans. */
class FakeNoteRepository implements INoteRepository {
  #notes = new Map<string, Note>();

  async findById(id: string) {
    return this.#notes.get(id) ?? null;
  }
  async countByOwner(ownerId: string) {
    return [...this.#notes.values()].filter(note => note.ownerId.value === ownerId).length;
  }
  async save(note: Note) {
    this.#notes.set(note._id.value, note);
  }
}

const plansOf = (pro: string[]): IAccountPlans => ({
  planOf: async id => (pro.includes(id) ? AccountPlan.PRO : AccountPlan.FREE),
});

describe('NoteCreation (domain service)', () => {
  let repository: FakeNoteRepository;
  let creation: NoteCreation;

  beforeEach(() => {
    repository = new FakeNoteRepository();
    creation = new NoteCreation(repository, plansOf(['bob']));
  });

  async function notesOwnedBy(ownerId: string, count: number) {
    for (let i = 0; i < count; i++) {
      const note = await creation.create({ ownerId, title: `Note ${i}`, content: '' });
      if (note.isFailure()) throw note.error;
      await repository.save(note.data);
    }
  }

  it('writes a note for an account on the free plan that is under the limit', async () => {
    await notesOwnedBy('alice', NoteCreation.FREE_PLAN_NOTE_LIMIT - 1);

    const result = await creation.create({ ownerId: 'alice', title: 'Tenth', content: '' });

    expect(result.isSuccess()).toBe(true);
    expect(result.data?.title).toBe('Tenth');
  });

  it('refuses one more note to an account on the free plan that is at the limit', async () => {
    await notesOwnedBy('alice', NoteCreation.FREE_PLAN_NOTE_LIMIT);

    const result = await creation.create({ ownerId: 'alice', title: 'Eleventh', content: '' });

    expect(result.error).toBeInstanceOf(NoteQuotaExceededException);
    expect(result.error).toMatchObject({
      context: { plan: AccountPlan.FREE, limit: NoteCreation.FREE_PLAN_NOTE_LIMIT },
    });
  });

  it('counts only the notes of that account', async () => {
    await notesOwnedBy('carol', NoteCreation.FREE_PLAN_NOTE_LIMIT);

    const result = await creation.create({ ownerId: 'alice', title: 'Mine', content: '' });

    expect(result.isSuccess()).toBe(true);
  });

  it('puts no limit on the pro plan', async () => {
    await notesOwnedBy('bob', NoteCreation.FREE_PLAN_NOTE_LIMIT);

    const result = await creation.create({ ownerId: 'bob', title: 'Eleventh', content: '' });

    expect(result.isSuccess()).toBe(true);
  });

  it("still leaves the note's own rules to the aggregate", async () => {
    const result = await creation.create({ ownerId: 'alice', title: '   ', content: '' });

    expect(result.error).toBeInstanceOf(BlankNoteTitleException);
  });
});
