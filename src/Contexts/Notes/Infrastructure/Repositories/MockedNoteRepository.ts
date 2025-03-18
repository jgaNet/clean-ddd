import { jest } from '@jest/globals';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { InMemoryNoteRepository } from './InMemoryNoteRepository';

// TODO: Try to remove all this mockReset
export class MockedNoteRepository extends InMemoryNoteRepository {
  static clearMocks() {
    (MockedNoteRepository.prototype.nextIdentity as jest.Mock).mockReset();
  }
}

MockedNoteRepository.prototype.nextIdentity = jest
  .fn<INoteRepository['nextIdentity']>()
  .mockImplementation(async () => InMemoryNoteRepository.prototype.nextIdentity());
