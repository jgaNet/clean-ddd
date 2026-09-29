import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { CommentNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CommentNote/CommentNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/**
 * Same shape as EditNote: who is calling -> load the note -> ask it to take the comment ->
 * save -> publish. Whether the caller may comment (the note is shared with them, and is not
 * archived) and whether the text is acceptable are the aggregate's rules. The operation's
 * result is the new comment's id, the way CreateNote answers the new note's id.
 */
export class CommentNoteCommandHandler extends CommandHandler<CommentNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  async execute({ payload }: CommentNoteCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const author = requireSignedIn(context);
    if (author.isFailure()) return author;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const comment = note.comment(author.data, payload.text);
    if (comment.isFailure()) return comment;

    await this.noteRepository.save(note);
    this.publishDomainEvents(note, context);

    return Result.ok(comment.data._id.value);
  }
}
