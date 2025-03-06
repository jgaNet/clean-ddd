import { CommandHandler, IResult, Result } from '@Primitives';
import { Auth } from '@Contexts/Security/Domain/Auth/Auth';
import { IAuthRepository } from '@Contexts/Security/Domain/Auth/Ports/IAuthRepository';
import { CreateAuthCommandEvent } from './CreateAuthCommandEvent';

export class CreateAuthCommandHandler extends CommandHandler<CreateAuthCommandEvent> {
  constructor(private authRepository: IAuthRepository) {
    super();
  }

  async execute(command: CreateAuthCommandEvent): Promise<IResult<string>> {
    const { subjectId, subjectType, credentials, isActive } = command.payload;

    // Create the Auth entity
    const authResult = Auth.create({
      subjectId,
      subjectType,
      credentials,
      isActive,
    });

    if (authResult.isFailure()) {
      return Result.fail(authResult.error);
    }

    const auth = authResult.data;

    // Save the Auth entity
    await this.authRepository.save(auth);

    // Return the Auth ID
    return Result.ok(auth.id);
  }
}
