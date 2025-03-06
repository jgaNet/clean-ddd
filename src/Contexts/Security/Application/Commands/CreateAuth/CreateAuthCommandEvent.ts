import { Event } from '@Primitives';

interface CreateAuthPayload {
  subjectId: string;
  subjectType: string;
  credentials: {
    type: string;
    value: string;
  };
  isActive?: boolean;
}

export class CreateAuthCommandEvent extends Event<CreateAuthPayload> {}
