export interface AccountViewModel {
  id: string;
  email: string;
  role: string;
  status: string;
  plan: string;
  lastAuthenticatedAt?: Date;
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
