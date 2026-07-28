import type { UserRole } from '../types/firestore';

export const ROLES: Record<UserRole, { label: string; homeRoute: string }> = {
  network_admin: { label: 'Admin réseau', homeRoute: '/admin/dashboard' },
  director: { label: 'Directeur', homeRoute: '/director/dashboard' },
  educator: { label: 'Éducateur', homeRoute: '/educator/dashboard' },
  parent: { label: 'Parent', homeRoute: '/parent/dashboard' },
};

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  network_admin: 4,
  director: 3,
  educator: 2,
  parent: 1,
};

export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
}
