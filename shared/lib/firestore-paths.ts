/**
 * Chemins Firestore — isolation multi-tenant stricte.
 *
 * Structure :
 *   tenants/{tenantId}/...
 *
 * Toutes les requêtes DOIVENT inclure tenantId.
 * Les règles Firestore vérifient que request.auth.token.tenantIds contient le tenantId.
 */
export const paths = {
  tenant: (tenantId: string) => `tenants/${tenantId}`,

  members: (tenantId: string) => `tenants/${tenantId}/members`,
  member: (tenantId: string, uid: string) => `tenants/${tenantId}/members/${uid}`,

  groups: (tenantId: string) => `tenants/${tenantId}/groups`,
  group: (tenantId: string, groupId: string) => `tenants/${tenantId}/groups/${groupId}`,

  children: (tenantId: string) => `tenants/${tenantId}/children`,
  child: (tenantId: string, childId: string) => `tenants/${tenantId}/children/${childId}`,

  dailyLogs: (tenantId: string, childId: string) =>
    `tenants/${tenantId}/children/${childId}/dailyLogs`,
  dailyLog: (tenantId: string, childId: string, date: string) =>
    `tenants/${tenantId}/children/${childId}/dailyLogs/${date}`,

  photos: (tenantId: string, childId: string) =>
    `tenants/${tenantId}/children/${childId}/photos`,
  photo: (tenantId: string, childId: string, photoId: string) =>
    `tenants/${tenantId}/children/${childId}/photos/${photoId}`,

  announcements: (tenantId: string) => `tenants/${tenantId}/announcements`,
  announcement: (tenantId: string, msgId: string) =>
    `tenants/${tenantId}/announcements/${msgId}`,
  announcementAcks: (tenantId: string, msgId: string) =>
    `tenants/${tenantId}/announcements/${msgId}/acks`,

  privateMessages: (tenantId: string) => `tenants/${tenantId}/privateMessages`,
  privateMessage: (tenantId: string, msgId: string) =>
    `tenants/${tenantId}/privateMessages/${msgId}`,

  consents: (tenantId: string) => `tenants/${tenantId}/consents`,
  consent: (tenantId: string, consentId: string) =>
    `tenants/${tenantId}/consents/${consentId}`,

  invitations: (tenantId: string) => `tenants/${tenantId}/invitations`,
  invitation: (tenantId: string, inviteId: string) =>
    `tenants/${tenantId}/invitations/${inviteId}`,
} as const;
