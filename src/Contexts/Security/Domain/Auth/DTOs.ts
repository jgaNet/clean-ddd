export interface IAuth {
  _id: string;
  subjectId: string;     // Can be a user ID or service ID
  subjectType: string;   // Type of subject (user, service, etc.)
  credentials: {
    type: string;        // Password, key, certificate, etc.
    value: string;       // Hashed value
  };
  lastAuthenticated?: Date;
  isActive: boolean;
}

export interface IAuthToken {
  token: string;
  subjectId: string;
  subjectType: string;
  issuedAt: Date;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}