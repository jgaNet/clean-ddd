import { Mapper } from '@Primitives';
import { Auth } from './Auth';
import { IAuth } from './DTOs';

export class AuthMapper implements Mapper<Auth, IAuth> {
  toEntity(dto: IAuth): Auth {
    const result = Auth.create({
      subjectId: dto.subjectId,
      subjectType: dto.subjectType,
      credentials: dto.credentials,
      isActive: dto.isActive,
    });

    if (result.isFailure()) {
      throw result.error;
    }

    return result.data;
  }

  toJSON(domain: Auth): IAuth {
    return domain.toDTO();
  }
}
