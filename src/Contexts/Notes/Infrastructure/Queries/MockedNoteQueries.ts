import { jest } from '@jest/globals';
import { InMemoryNoteQueries } from './InMemoryNoteQueries';
import { INoteQueries } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';

// TODO: Try to remove all this mockReset
export class MockedNoteQueries extends InMemoryNoteQueries {
  static clearMocks() {
    (MockedNoteQueries.prototype.findByOwnerId as jest.Mock).mockReset();
  }
}

MockedNoteQueries.prototype.findByOwnerId = jest.fn<INoteQueries['findByOwnerId']>().mockImplementation(async email => {
  return InMemoryNoteQueries.prototype.findByOwnerId(email);
});
