import { NoteTitle } from './NoteTitle';
import { BlankNoteTitleException, NoteTitleTooLongException } from './NoteExceptions';

describe('NoteTitle', () => {
  it('accepts a regular title and trims it', () => {
    const title = NoteTitle.create('  Groceries  ');

    expect(title.isSuccess()).toBe(true);
    expect(title.data?.value).toBe('Groceries');
  });

  it('refuses a blank title', () => {
    const title = NoteTitle.create('   ');

    expect(title.isFailure()).toBe(true);
    expect(title.error).toBeInstanceOf(BlankNoteTitleException);
  });

  it('refuses a title longer than the maximum', () => {
    const title = NoteTitle.create('x'.repeat(NoteTitle.MAX_LENGTH + 1));

    expect(title.isFailure()).toBe(true);
    expect(title.error).toBeInstanceOf(NoteTitleTooLongException);
  });

  it('compares by value, not by reference', () => {
    const a = NoteTitle.create('Same');
    const b = NoteTitle.create('Same');

    expect(a.data?.equals(b.data as NoteTitle)).toBe(true);
  });
});
