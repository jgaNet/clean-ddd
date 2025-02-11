import { User } from '@Contexts/UsersManager/Domain/User/User';
import { IUserRepository } from '@Contexts/UsersManager/Domain/User/Ports/IUserRepository';
import { UserWithEmailAlreadyExists } from '@Contexts/UsersManager/Domain/User/UserExceptions';
import { INewUser, IUser } from '@Contexts/UsersManager/Domain/User/DTOs';
import { IUserQueries } from '@Contexts/UsersManager/Domain/User/Ports/IUserQueries';
import Result from '@Primitives/Result';
export class UserFactory {
  #userRepository: IUserRepository;
  #userQueries: IUserQueries;

  constructor({ userRepository, userQueries }: { userRepository: IUserRepository; userQueries: IUserQueries }) {
    this.#userRepository = userRepository;
    this.#userQueries = userQueries;
  }

  async exists(newUserProps: INewUser): Promise<Result> {
    const user = await this.#userQueries.findByEmail(newUserProps.profile.email);

    if (user) {
      return Result.fail(new UserWithEmailAlreadyExists({ email: newUserProps.profile.email }));
    }

    return Result.ok();
  }

  async new(newUserProps: INewUser): Promise<Result<User | unknown>> {
    const result = await this.exists(newUserProps);

    if (result.error) {
      return result;
    }

    const userProps = newUserProps as IUser;

    userProps._id = await this.#userRepository.nextIdentity();

    return Result.ok(User.create(userProps));
  }
}
