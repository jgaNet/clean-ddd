import { FastifyReply, FastifyRequest } from 'fastify';
import { localApplication } from '@core/infrastructure/app/application.local';
import { CreateUserReqBody } from '../gateways/http/routes/user';

export class UserController {
  async createUser(req: FastifyRequest<{ Body: CreateUserReqBody }>, reply: FastifyReply) {
    try {
      await localApplication.commands.createUser.execute({
        profile: {
          email: req.body.email,
          nickname: req.body.nickname,
        },
      });
      return true;
    } catch (e) {
      reply.code(400);
      return e;
    }
  }
}

export const userController = new UserController();
