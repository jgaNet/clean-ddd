import { IResult, Result } from '@SharedKernel/Domain';
import { Id } from '@SharedKernel/Domain/Utils';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { IAccountDirectory } from '@Contexts/Notes/Domain/Note/Ports/IAccountDirectory';
import { RecipientNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';

/**
 * NoteSharing is a domain service: "a note can only be shared with an account that exists"
 * is a business rule, but the aggregate cannot check it alone because accounts live in
 * another context. The service asks through a port Notes owns (IAccountDirectory), then
 * lets the aggregate apply its own rules (owner only, not archived, not twice, not yourself).
 */
export class NoteSharing {
  constructor(private accounts: IAccountDirectory) {}

  async share(note: Note, actor: Id, recipient: Id): Promise<IResult> {
    if (!(await this.accounts.exists(recipient.value))) {
      return Result.fail(new RecipientNotFoundException(note._id.value, recipient.value));
    }
    return note.shareWith(actor, recipient);
  }
}
