import { User } from '@Contexts/Users/Domain/User/User';
import { IUserRepository } from '@Contexts/Users/Domain/User/Ports/IUserRepository';
import { UserWithEmailAlreadyExists } from '@Contexts/Users/Domain/User/UserExceptions';
import { INewUser, IUser } from '@Contexts/Users/Domain/User/DTOs';
import { IUserQueries } from '@Contexts/Users/Domain/User/Ports/IUserQueries';
import { Result, IResult } from '@SharedKernel/Domain/Application';
export class UserFactory {
  #userRepository: IUserRepository;
  #userQueries: IUserQueries;

  constructor({ userRepository, userQueries }: { userRepository: IUserRepository; userQueries: IUserQueries }) {
    this.#userRepository = userRepository;
    this.#userQueries = userQueries;
  }

  async exists(newUserProps: INewUser): Promise<IResult> {
    const user = await this.#userQueries.findByEmail(newUserProps.profile.email);

    if (user) {
      return Result.fail(new UserWithEmailAlreadyExists({ email: newUserProps.profile.email }));
    }

    return Result.ok();
  }

  async new(newUserProps: INewUser): Promise<IResult<User>> {
    const result = await this.exists(newUserProps);

    if (result.isFailure()) {
      return result;
    }

    const userProps = newUserProps as IUser;

    userProps._id = await this.#userRepository.nextIdentity();

    return User.create(userProps);
  }
}
