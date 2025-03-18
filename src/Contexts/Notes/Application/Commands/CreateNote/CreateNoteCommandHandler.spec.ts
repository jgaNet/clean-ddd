import { expect, jest } from '@jest/globals';
import { mockNotesModule, mockedNoteRepository } from '@Contexts/Notes/module.mock';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote';
import { MockedNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/MockedNoteRepository';
import { MockedNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/MockedNoteQueries';
import { Role, EventBus, ExecutionContext } from '@SharedKernel/Domain';
import { BlankNoteException } from '@Contexts/Notes/Domain/Note';

const eventBusMock = {
  connect: jest.fn(),
  publish: jest.fn(),
  subscribe: jest.fn(),
} as EventBus;

beforeEach(() => {
  jest.resetAllMocks();
  MockedNoteRepository.clearMocks();
  MockedNoteQueries.clearMocks();
});

describe('how to create a note', function () {
  it('should create a note', async () => {
    (mockedNoteRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));
    const saveSpy = jest.spyOn(mockedNoteRepository, 'save');
    await mockNotesModule.getCommand(CreateNoteCommandEvent).execute(
      CreateNoteCommandEvent.set({
        title: 'test',
        content: 'test',
      }),
      new ExecutionContext({
        traceId: 'mockedTraceId',
        eventBus: eventBusMock,
        auth: {
          subjectId: 'ownerId',
          role: Role.USER,
        },
      }),
    );

    expect(saveSpy).toHaveBeenCalledWith({
      _id: 'mockedId',
      ownerId: 'ownerId',
      title: 'test',
      content: 'test',
    });
  });

  it('should not create a note if the title is not specify', async () => {
    const saveSpy = jest.spyOn(mockedNoteRepository, 'save');
    const result = await mockNotesModule.getCommand(CreateNoteCommandEvent).execute(
      CreateNoteCommandEvent.set({
        title: '',
        content: 'content',
      }),
      new ExecutionContext({
        traceId: 'mockedTraceId',
        eventBus: eventBusMock,
        auth: {
          subjectId: 'mockedNoteId',
          role: Role.ADMIN,
        },
      }),
    );

    expect(result.isFailure()).toBeTruthy();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(result.error).toBeInstanceOf(BlankNoteException);
  });
});
