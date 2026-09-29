import { NoteCommentText } from './NoteCommentText';
import { BlankNoteCommentException, NoteCommentTooLongException } from './NoteExceptions';

describe('NoteCommentText', () => {
  it('accepts a regular text and trims it', () => {
    const text = NoteCommentText.create('  Looks good to me  ');

    expect(text.isSuccess()).toBe(true);
    expect(text.data?.value).toBe('Looks good to me');
  });

  it('accepts exactly the maximum length', () => {
    const text = NoteCommentText.create('x'.repeat(NoteCommentText.MAX_LENGTH));

    expect(text.isSuccess()).toBe(true);
  });

  it('refuses a blank text', () => {
    const text = NoteCommentText.create('   ');

    expect(text.isFailure()).toBe(true);
    expect(text.error).toBeInstanceOf(BlankNoteCommentException);
  });

  it('refuses a text longer than 500 characters', () => {
    const text = NoteCommentText.create('x'.repeat(NoteCommentText.MAX_LENGTH + 1));

    expect(text.isFailure()).toBe(true);
    expect(text.error).toBeInstanceOf(NoteCommentTooLongException);
  });
});
