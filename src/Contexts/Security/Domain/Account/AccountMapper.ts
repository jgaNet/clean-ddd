import { Mapper } from '@Primitives';
import { Account } from './Account';
import { IAccount } from './DTOs';

export class AccountMapper implements Mapper<Account, IAccount> {
  toEntity(dto: IAccount): Account {
    const account = Account.create({
      subjectId: dto.subjectId,
      subjectType: dto.subjectType,
      credentials: dto.credentials,
      isActive: dto.isActive,
    });

    if (account.isFailure()) {
      throw account;
    }

    return account.data;
  }

  toJSON(domain: Account): IAccount {
    return {
      _id: domain._id,
      subjectId: domain.subjectId,
      subjectType: domain.subjectType,
      credentials: { ...domain.credentials },
      lastAuthenticated: domain.lastAuthenticated,
      isActive: domain.isActive,
    };
  }
}
