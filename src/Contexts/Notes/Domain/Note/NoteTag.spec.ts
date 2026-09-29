import { NoteTag } from './NoteTag';
import { InvalidNoteTagException } from './NoteExceptions';

describe('NoteTag', () => {
  it('accepts lowercase letters and digits and trims the input', () => {
    const tag = NoteTag.create('  work2024  ');

    expect(tag.isSuccess()).toBe(true);
    expect(tag.data?.value).toBe('work2024');
  });

  it.each(['a', 'x'.repeat(NoteTag.MAX_LENGTH + 1), 'Work', 'to-do', 'two words', ''])('refuses %p', raw => {
    const tag = NoteTag.create(raw);

    expect(tag.isFailure()).toBe(true);
    expect(tag.error).toBeInstanceOf(InvalidNoteTagException);
  });

  it('accepts the shortest and the longest tag', () => {
    expect(NoteTag.create('a'.repeat(NoteTag.MIN_LENGTH)).isSuccess()).toBe(true);
    expect(NoteTag.create('a'.repeat(NoteTag.MAX_LENGTH)).isSuccess()).toBe(true);
  });

  it('compares by value, not by reference', () => {
    const a = NoteTag.create('same');
    const b = NoteTag.create('same');

    expect(a.data?.equals(b.data as NoteTag)).toBe(true);
  });
});
