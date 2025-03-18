import { expect, jest } from '@jest/globals';
import { mockSecurityModule, mockAccountRepository } from '@Contexts/Security/module.mock';
import { MockedNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/MockedNoteRepository';
import { MockedNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/MockedNoteQueries';
import { Role, EventBus, ExecutionContext, InvalidEmailFormat } from '@SharedKernel/Domain';
import { SignUpCommandEvent } from '@Contexts/Security/Application/Commands';

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

describe('how to create an account', function () {
  it('should sign up a new account with email', async () => {
    const saveSpy = jest.spyOn(mockAccountRepository, 'save');
    const context = new ExecutionContext({
      traceId: 'mockedTraceId',
      eventBus: eventBusMock,
      auth: {
        subjectId: '',
        role: Role.GUEST,
      },
    });

    await mockSecurityModule.getCommand(SignUpCommandEvent).execute(
      SignUpCommandEvent.set({
        subjectId: 'user@user.fr',
        subjectType: 'user',
        credentials: { type: 'password', value: 'password' },
        isActive: false,
      }),
      context,
    );

    expect(saveSpy).toHaveBeenCalled();

    const savedAccount = saveSpy.mock.calls[0][0];

    expect(savedAccount.subjectId).toEqual('user@user.fr');
    expect(savedAccount.subjectType).toEqual(Role.USER);
    expect(savedAccount.credentials).toEqual({
      type: 'password',
      value: 'password',
    });
    expect(savedAccount.isActive).toEqual(false);
  });

  it('should not sign up a new account if no email', async () => {
    const saveSpy = jest.spyOn(mockAccountRepository, 'save');
    const context = new ExecutionContext({
      traceId: 'mockedTraceId',
      eventBus: eventBusMock,
      auth: {
        subjectId: '',
        role: Role.GUEST,
      },
    });

    const result = await mockSecurityModule.getCommand(SignUpCommandEvent).execute(
      SignUpCommandEvent.set({
        subjectId: 'simple-nickname',
        subjectType: 'user',
        credentials: { type: 'password', value: 'password' },
        isActive: false,
      }),
      context,
    );

    expect(saveSpy).not.toHaveBeenCalled();
    expect(result.isFailure()).toBeTruthy();
    expect(result.error).toBeInstanceOf(InvalidEmailFormat);
  });
});
