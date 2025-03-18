import { INoteQueries } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { Nullable } from '@SharedKernel/Domain/Utils';

export class InMemoryNoteQueries implements INoteQueries {
  dataSource: InMemoryDataSource<INote>;

  constructor(dataSource: InMemoryDataSource<INote>) {
    this.dataSource = dataSource;
  }

  async findByOwnerId(ownerId: string): Promise<Nullable<INote>> {
    return [...this.dataSource.collection.values()].find(note => note.ownerId === ownerId) || null;
  }

  async findById(id: string): Promise<Nullable<INote>> {
    return this.dataSource.collection.get(id) || null;
  }

  async findAll(): Promise<INote[]> {
    return [...this.dataSource.collection.values()];
  }
}
