import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { v4 as uuidv4 } from 'uuid';

export class InMemoryNoteRepository implements INoteRepository {
  dataSource: InMemoryDataSource<INote>;

  constructor(dataSource: InMemoryDataSource<INote>) {
    this.dataSource = dataSource;
  }

  async nextIdentity(): Promise<string> {
    return uuidv4();
  }

  async save(user: INote) {
    this.dataSource.collection.set(user._id, user);
  }
}
