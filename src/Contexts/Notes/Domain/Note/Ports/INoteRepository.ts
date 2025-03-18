import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { Repository } from '@SharedKernel/Domain/DDD';

export interface INoteRepository extends Repository<INote> {
  nextIdentity(): Promise<string>;
  save(user: INote): Promise<void>;
}
