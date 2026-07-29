// Types Firestore partagés mobile / web / functions

export type UserRole = 'network_admin' | 'director' | 'educator' | 'parent';

export type MealQuantity = 'none' | 'little' | 'half' | 'all';
export type MealType = 'breakfast' | 'lunch' | 'snack';
export type NapQuality = 'good' | 'average' | 'poor';
export type ActivityCategory = 'motor' | 'art' | 'music' | 'outdoor' | 'other';
export type MessageType = 'announcement' | 'private';
export type ConsentType = 'gdpr_data' | 'image_rights';

// ─── Custom Claims (Firebase Auth) ───────────────────────────────────────────
export interface CustomClaims {
  role: UserRole;
  tenantIds: string[]; // un parent peut avoir des enfants dans plusieurs crèches
  groupIds?: string[]; // pour éducateurs
  childIds?: string[]; // pour parents
}

// ─── Racine tenant ───────────────────────────────────────────────────────────
export interface Tenant {
  id: string;
  name: string;
  address: string;
  siret?: string;
  subscriptionStatus: 'active' | 'trial' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

// ─── Membres du tenant ─────────────────────────────────────────────────────────
export interface TenantMember {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  groupIds?: string[]; // éducateurs assignés à des groupes
  childIds?: string[]; // parents liés à des enfants
  fcmTokens: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Groupes (classes) ─────────────────────────────────────────────────────────
export interface Group {
  id: string;
  name: string; // ex: "Bébés", "Moyens"
  educatorIds: string[];
  createdAt: Date;
}

// ─── Enfants ───────────────────────────────────────────────────────────────────
export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  groupId: string;
  parentIds: string[];
  allergies: string[];
  enrollmentStatus: 'active' | 'departed';
  departedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Suivi quotidien ───────────────────────────────────────────────────────────
export interface MealEntry {
  id: string;
  time: Date;
  type: MealType;
  quantity: MealQuantity;
  accepted: boolean;
  notes?: string;
  recordedBy: string;
}

export interface NapEntry {
  id: string;
  sleepTime: Date;
  wakeTime?: Date;
  durationMinutes?: number;
  quality: NapQuality;
  notes?: string;
  recordedBy: string;
}

export interface HealthEntry {
  id: string;
  time: Date;
  temperature?: number;
  medication?: string;
  incident?: string;
  notes?: string;
  recordedBy: string;
}

export interface ActivityEntry {
  id: string;
  time: Date;
  category: ActivityCategory;
  description: string;
  photoUrl?: string;
  recordedBy: string;
}

export interface DiaperEntry {
  id: string;
  time: Date;
  type: 'wet' | 'dirty' | 'both';
  notes?: string;
  recordedBy: string;
}

export interface DailyLog {
  id: string; // format YYYY-MM-DD
  childId: string;
  date: string;
  meals: MealEntry[];
  naps: NapEntry[];
  health: HealthEntry[];
  activities: ActivityEntry[];
  diapers: DiaperEntry[];
  summarySent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Messagerie ────────────────────────────────────────────────────────────────
export interface Announcement {
  id: string;
  type: 'announcement';
  title: string;
  body: string;
  senderId: string;
  senderName: string;
  groupId?: string; // null = toute la crèche
  requiresAck: boolean;
  createdAt: Date;
}

export interface AnnouncementAck {
  parentId: string;
  acknowledgedAt: Date;
}

export interface PrivateMessage {
  id: string;
  type: 'private';
  senderId: string;
  senderName: string;
  recipientId: string;
  childId: string;
  body: string;
  /** URL Firebase Storage si pièce jointe */
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  readAt?: Date;
  createdAt: Date;
}

export type Message = Announcement | PrivateMessage;

// ─── Album photo ───────────────────────────────────────────────────────────────
export interface ChildPhoto {
  id: string;
  childId: string;
  storagePath: string;
  downloadUrl: string;
  caption?: string;
  uploadedBy: string;
  createdAt: Date;
}

// ─── Consentements RGPD ────────────────────────────────────────────────────────
export interface Consent {
  id: string;
  childId: string;
  parentId: string;
  type: ConsentType;
  accepted: boolean;
  signedAt: Date;
  revokedAt?: Date;
  ipAddress?: string;
  version: string; // version du texte légal
}

// ─── Invitations parents ───────────────────────────────────────────────────────
export interface ParentInvitation {
  id: string;
  childId: string;
  email: string;
  inviteCode: string;
  expiresAt: Date;
  usedAt?: Date;
  createdBy: string;
}
