export interface IEncryptionKey {
  _id: string;
  name: string;
  type: 'symmetric' | 'asymmetric' | 'hmac';
  algorithm: string;
  keyValue: string;  // Encrypted or hashed key value
  isActive: boolean;
  createdAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface IEncryptionRequest {
  data: string | Buffer;
  keyId?: string;      // Optional - use default if not provided
  algorithm?: string;  // Optional - use default if not provided
  metadata?: Record<string, unknown>;
}

export interface IEncryptionResult {
  data: string | Buffer;
  keyId: string;
  algorithm: string;
  iv?: string;         // Initialization vector if applicable
  authTag?: string;    // Authentication tag if applicable
  timestamp: Date;
}