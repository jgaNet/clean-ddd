export interface IPermission {
  _id: string;
  name: string;
  resource: string;
  action: string;  // read, write, delete, etc.
  description?: string;
}

export interface IRole {
  _id: string;
  name: string;
  description?: string;
  permissions: string[];  // Permission IDs
}

export interface ISubjectRole {
  subjectId: string;
  subjectType: string;
  roleId: string;
}

export interface IAccessPolicy {
  _id: string;
  name: string;
  description?: string;
  rules: IAccessRule[];
  isActive: boolean;
}

export interface IAccessRule {
  resources: string[];
  actions: string[];
  subjects: {
    type: string;
    identifiers?: string[];
    roles?: string[];
  }[];
  conditions?: Record<string, unknown>;
  effect: 'allow' | 'deny';
  priority: number;
}