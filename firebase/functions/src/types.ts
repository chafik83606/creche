export type UserRole = 'network_admin' | 'director' | 'educator' | 'parent';

export interface CustomClaims {
  role: UserRole;
  tenantIds: string[];
  groupIds?: string[];
  childIds?: string[];
}
