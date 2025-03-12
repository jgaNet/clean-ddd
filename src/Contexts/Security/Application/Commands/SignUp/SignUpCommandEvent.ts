import { Event } from '@Primitives';

interface SignUpPayload {
  subjectId: string;
  subjectType: string;
  credentials: {
    type: string;
    value: string;
  };
  isActive?: boolean;
}

export class SignUpCommandEvent extends Event<SignUpPayload> {}
