import { QueryHandler, Result, IResult } from '@Primitives';
import { IAuthQueries } from '@Contexts/Security/Domain/Auth/Ports/IAuthQueries';
import { IAuth } from '@Contexts/Security/Domain/Auth/DTOs';

export class GetAuthQueryHandler extends QueryHandler<IAuthQueries, string, IResult<IAuth>> {
  constructor(private authQueries: IAuthQueries) {
    super(authQueries);
  }
  async execute(id: string): Promise<IResult<IAuth>> {
    try {
      const auth = await this.authQueries.findById(id);

      if (!auth) {
        return Result.fail(new Error(`Auth with ID ${id} not found`));
      }

      return Result.ok(auth);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error('Error getting auth'));
    }
  }
}
