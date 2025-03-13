export interface IAccount {
  _id: string;
  subjectId: string; // Can be a user ID or service ID
  subjectType: string; // Type of subject (user, service, etc.)
  credentials: {
    type: string; // Password, key, certificate, etc.
    value: string; // Hashed value
    metadata?: Record<string, unknown>; // Additional info like email, etc.
  };
  lastAuthenticated?: Date;
  isActive: boolean;
}

export interface IAccountToken {
  subjectId: string;
  subjectType: string;
  issuedAt: Date;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}
