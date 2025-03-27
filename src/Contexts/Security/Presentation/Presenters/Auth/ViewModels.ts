export interface AccountViewModel {
  subjectId: string;
  subjectType: string;
  credentials: {
    type: string;
  };
  lastAuthenticated?: Date;
  isActive: boolean;
}

export interface ErrorViewModel {
  message: string;
}

export interface LogoutViewModel {
  message: string;
}

export interface LoginViewModel {
  token: string;
}
