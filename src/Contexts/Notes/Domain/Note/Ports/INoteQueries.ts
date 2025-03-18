import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { Repository } from '@SharedKernel/Domain/DDD';

export interface INoteQueries extends Repository<INote> {
  findAll(): Promise<INote[]>;
  findById(id: string): Promise<INote | null>;
  findByOwnerId(ownerId: string): Promise<INote | null>;
}
