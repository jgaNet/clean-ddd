export interface IAuditLog {
  _id: string;
  timestamp: Date;
  action: string;
  resource: string;
  resourceId?: string;
  subjectId: string;
  subjectType: string;
  status: 'success' | 'failure';
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export enum AuditEventType {
  ACCESS = 'access',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data_access',
  DATA_CHANGE = 'data_change',
  SYSTEM = 'system',
  SECURITY = 'security'
}