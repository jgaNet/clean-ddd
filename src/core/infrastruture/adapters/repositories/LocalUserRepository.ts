import { User } from '@core/domain/user/User';

export class LocalUserRepository {
  findById(id: string): User {
    return { _id: id }
  }
}
