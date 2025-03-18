import { expect, jest } from '@jest/globals';
import { mockNotesModule, mockedNoteRepository } from '@Contexts/Notes/module.mock';
import { MockedNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/MockedNoteQueries';
import { MockedNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/MockedNoteRepository';
import { Result, EventBus, ExecutionContext, Role } from '@SharedKernel/Domain';
import { GetNotesQueryHandler } from '@Contexts/Notes/Application/Queries/GetNotes';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote';

const eventBusMock = {
  connect: jest.fn(),
  publish: jest.fn(),
  subscribe: jest.fn(),
} as EventBus;

beforeEach(() => {
  MockedNoteRepository.clearMocks();
  MockedNoteQueries.clearMocks();
});

describe('get notes', function () {
  it('should not find notes', async () => {
    const context = new ExecutionContext({
      traceId: 'mockedTraceId',
      eventBus: eventBusMock,
      auth: {
        subjectId: 'mockedNoteId',
        role: Role.ADMIN,
      },
    });
    const result = await mockNotesModule.getQuery(GetNotesQueryHandler).execute(null, context);
    expect(result).toEqual(Result.ok([]));
  });

  it('should find notes', async () => {
    (mockedNoteRepository.nextIdentity as jest.Mock).mockImplementationOnce(() => Promise.resolve('mockedId'));

    const context = new ExecutionContext({
      traceId: 'mockedTraceId',
      eventBus: eventBusMock,
      auth: {
        subjectId: 'mockedNoteId',
        role: Role.ADMIN,
      },
    });

    await mockNotesModule.getCommand(CreateNoteCommandEvent).execute(
      CreateNoteCommandEvent.set({
        profile: {
          email: 'a@a.com',
          nickname: 'a',
        },
      }),
      context,
    );

    const result = await mockNotesModule.getQuery(GetNotesQueryHandler).execute(null, context);

    expect(result.isSuccess()).toBeTruthy();
    expect((result.data as unknown[]).length).toEqual(1);
  });
});
