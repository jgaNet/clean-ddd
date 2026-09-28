import { CommandEvent } from '@SharedKernel/Domain';

interface SignUpPayload {
  subjectId: string;
  subjectType: string;
  credentials: {
    type: string;
    value: string;
  };
  isActive?: boolean;
}

export class SignUpCommandEvent extends CommandEvent<SignUpPayload> {}
