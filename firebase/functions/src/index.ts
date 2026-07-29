import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import type { UserRole, CustomClaims } from './types';
import { sendPush } from './push';

// Région Paris (HDS) pour toutes les Cloud Functions
setGlobalOptions({ region: 'europe-west9' });

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

function slugifyTenantId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function randomInviteCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// ─── Attribution des custom claims à l'inscription ───────────────────────────

interface SetRoleRequest {
  uid?: string;
  email?: string;
  role: UserRole;
  tenantId: string;
  groupIds?: string[];
  childIds?: string[];
}

/**
 * Callable function — appelée par un admin/directeur après création du compte.
 * Seuls network_admin et director peuvent attribuer des rôles.
 */
export const setUserRole = onCall<SetRoleRequest>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentification requise.');
  }

  const callerRole = request.auth.token.role as UserRole;
  if (!['network_admin', 'director'].includes(callerRole)) {
    throw new HttpsError('permission-denied', 'Rôle insuffisant.');
  }

  const { role, tenantId, groupIds, childIds } = request.data;
  let { uid, email } = request.data;

  if (role === 'network_admin' && callerRole !== 'network_admin') {
    throw new HttpsError('permission-denied', 'Seul un admin réseau peut attribuer ce rôle.');
  }

  if (!uid && email) {
    const userRecord = await auth.getUserByEmail(email.trim().toLowerCase());
    uid = userRecord.uid;
  }

  if (!uid) {
    throw new HttpsError('invalid-argument', 'uid ou email requis.');
  }

  const targetUser = await auth.getUser(uid);
  const existingClaims = targetUser.customClaims ?? {};
  const tenantIds: string[] = existingClaims.tenantIds ?? [];
  if (!tenantIds.includes(tenantId)) {
    tenantIds.push(tenantId);
  }

  const claims: CustomClaims = {
    role,
    tenantIds,
    ...(groupIds && { groupIds }),
    ...(childIds && { childIds }),
  };

  await auth.setCustomUserClaims(uid, claims);

  await db.doc(`tenants/${tenantId}/members/${uid}`).set(
    {
      uid,
      email: targetUser.email,
      displayName: targetUser.displayName ?? targetUser.email,
      role,
      groupIds: groupIds ?? [],
      childIds: childIds ?? [],
      fcmTokens: [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { success: true };
});

interface CreateTenantRequest {
  name: string;
  address?: string;
  tenantId?: string;
}

/**
 * Onboarding: le premier compte connecté peut créer sa crèche
 * et devient automatiquement admin réseau.
 */
export const createTenant = onCall<CreateTenantRequest>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentification requise.');
  }

  const uid = request.auth.uid;
  const { name, address, tenantId } = request.data;
  if (!name?.trim()) {
    throw new HttpsError('invalid-argument', 'Nom de crèche requis.');
  }

  const userRecord = await auth.getUser(uid);
  const existingClaims = (userRecord.customClaims ?? {}) as Partial<CustomClaims>;
  const existingRole = existingClaims.role;

  if (existingRole && existingRole !== 'network_admin') {
    throw new HttpsError(
      'permission-denied',
      'Seul un compte sans rôle ou admin réseau peut créer une nouvelle crèche.'
    );
  }

  const baseId = slugifyTenantId(tenantId || name) || `tenant-${Date.now()}`;
  let finalTenantId = baseId;
  let suffix = 2;
  while ((await db.doc(`tenants/${finalTenantId}`).get()).exists) {
    finalTenantId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  await db.doc(`tenants/${finalTenantId}`).set({
    id: finalTenantId,
    name: name.trim(),
    address: address?.trim() || '',
    subscriptionStatus: 'trial',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const tenantIds = Array.from(
    new Set([...(existingClaims.tenantIds ?? []), finalTenantId])
  );

  await auth.setCustomUserClaims(uid, {
    ...existingClaims,
    role: existingRole ?? 'network_admin',
    tenantIds,
  });

  await db.doc(`tenants/${finalTenantId}/members/${uid}`).set(
    {
      uid,
      email: userRecord.email,
      displayName: userRecord.displayName ?? userRecord.email,
      role: existingRole ?? 'network_admin',
      groupIds: [],
      childIds: [],
      fcmTokens: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    success: true,
    tenantId: finalTenantId,
    role: existingRole ?? 'network_admin',
  };
});

interface CreateInvitationRequest {
  tenantId: string;
  email: string;
  role: UserRole;
  childId?: string;
  groupIds?: string[];
}

export const createInvitation = onCall<CreateInvitationRequest>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentification requise.');
  }

  const callerRole = request.auth.token.role as UserRole;
  if (!['network_admin', 'director'].includes(callerRole)) {
    throw new HttpsError('permission-denied', 'Rôle insuffisant.');
  }

  const { tenantId, email, role, childId, groupIds } = request.data;
  if (!tenantId || !email?.trim()) {
    throw new HttpsError('invalid-argument', 'tenantId et email requis.');
  }
  if (role === 'network_admin') {
    throw new HttpsError('invalid-argument', 'Rôle network_admin non invitables par code.');
  }
  if (role === 'parent' && !childId) {
    throw new HttpsError('invalid-argument', 'childId requis pour inviter un parent.');
  }

  const memberDoc = await db.doc(`tenants/${tenantId}/members/${request.auth.uid}`).get();
  if (!memberDoc.exists) {
    throw new HttpsError('permission-denied', 'Vous devez appartenir à la crèche ciblée.');
  }

  const inviteCode = randomInviteCode(8);
  const inviteRef = db.collection(`tenants/${tenantId}/invitations`).doc();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  await inviteRef.set({
    email: email.trim().toLowerCase(),
    role,
    childId: childId ?? null,
    groupIds: groupIds ?? [],
    inviteCode,
    usedAt: null,
    usedBy: null,
    createdBy: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
  });

  return { success: true, inviteCode, invitationId: inviteRef.id, expiresAt: expiresAt.toISOString() };
});

interface RegisterWithInviteRequest {
  email: string;
  password: string;
  displayName: string;
  inviteCode: string;
}

export const registerWithInvite = onCall<RegisterWithInviteRequest>(async (request) => {
  const { email, password, displayName, inviteCode } = request.data;
  if (!email?.trim() || !password || !displayName?.trim() || !inviteCode?.trim()) {
    throw new HttpsError('invalid-argument', 'email, password, displayName et inviteCode requis.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = inviteCode.trim().toUpperCase();
  const inviteSnap = await db
    .collectionGroup('invitations')
    .where('inviteCode', '==', normalizedCode)
    .where('usedAt', '==', null)
    .limit(1)
    .get();

  if (inviteSnap.empty) {
    throw new HttpsError('not-found', 'Code d’invitation invalide ou déjà utilisé.');
  }

  const inviteDoc = inviteSnap.docs[0];
  const inviteData = inviteDoc.data();
  const inviteEmail = (inviteData.email as string | undefined)?.toLowerCase();
  if (inviteEmail && inviteEmail !== normalizedEmail) {
    throw new HttpsError('permission-denied', 'Ce code est réservé à une autre adresse email.');
  }

  const expiresAt = inviteData.expiresAt?.toDate?.();
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    throw new HttpsError('failed-precondition', 'Code d’invitation expiré.');
  }

  const tenantId = inviteDoc.ref.parent.parent?.id;
  if (!tenantId) {
    throw new HttpsError('internal', 'Invitation invalide (tenant introuvable).');
  }

  const role = inviteData.role as UserRole;
  const childId = inviteData.childId as string | null;
  const groupIds = (inviteData.groupIds as string[] | undefined) ?? [];
  const userRecord = await auth.createUser({
    email: normalizedEmail,
    password,
    displayName: displayName.trim(),
  });

  const claims: CustomClaims = {
    role,
    tenantIds: [tenantId],
    ...(role === 'educator' && groupIds.length > 0 && { groupIds }),
    ...(role === 'parent' && childId && { childIds: [childId] }),
  };
  await auth.setCustomUserClaims(userRecord.uid, claims);

  await db.doc(`tenants/${tenantId}/members/${userRecord.uid}`).set({
    uid: userRecord.uid,
    email: normalizedEmail,
    displayName: displayName.trim(),
    role,
    groupIds: role === 'educator' ? groupIds : [],
    childIds: role === 'parent' && childId ? [childId] : [],
    fcmTokens: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (role === 'parent' && childId) {
    await db.doc(`tenants/${tenantId}/children/${childId}`).set(
      { parentIds: admin.firestore.FieldValue.arrayUnion(userRecord.uid) },
      { merge: true }
    );
  }

  await inviteDoc.ref.update({
    usedAt: admin.firestore.FieldValue.serverTimestamp(),
    usedBy: userRecord.uid,
  });

  return { success: true, uid: userRecord.uid, tenantId, role };
});

// ─── Inscription parent via code d'invitation ────────────────────────────────

interface RegisterParentRequest {
  email: string;
  password: string;
  displayName: string;
  inviteCode: string;
  tenantId: string;
}

export const registerParent = onCall<RegisterParentRequest>(async (request) => {
  const { email, password, displayName, inviteCode, tenantId } = request.data;

  const inviteSnap = await db
    .collection(`tenants/${tenantId}/invitations`)
    .where('inviteCode', '==', inviteCode)
    .where('usedAt', '==', null)
    .limit(1)
    .get();

  if (inviteSnap.empty) {
    throw new HttpsError('not-found', 'Code d\'invitation invalide ou expiré.');
  }

  const invite = inviteSnap.docs[0];
  const inviteData = invite.data();
  const childId = inviteData.childId;

  const userRecord = await auth.createUser({ email, password, displayName });

  const claims: CustomClaims = {
    role: 'parent',
    tenantIds: [tenantId],
    childIds: [childId],
  };
  await auth.setCustomUserClaims(userRecord.uid, claims);

  await db.doc(`tenants/${tenantId}/members/${userRecord.uid}`).set({
    uid: userRecord.uid,
    email,
    displayName,
    role: 'parent',
    childIds: [childId],
    fcmTokens: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.doc(`tenants/${tenantId}/children/${childId}`).update({
    parentIds: admin.firestore.FieldValue.arrayUnion(userRecord.uid),
  });

  await invite.ref.update({ usedAt: admin.firestore.FieldValue.serverTimestamp() });

  return { uid: userRecord.uid };
});

// ─── Rafraîchir le token après changement de claims ──────────────────────────

export const refreshClaims = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentification requise.');
  }
  const user = await auth.getUser(request.auth.uid);
  return { claims: user.customClaims };
});

// ─── Notifications FCM ───────────────────────────────────────────────────────

async function getFcmTokens(tenantId: string, userIds: string[]): Promise<string[]> {
  const tokens: string[] = [];
  for (const uid of userIds) {
    const member = await db.doc(`tenants/${tenantId}/members/${uid}`).get();
    const data = member.data();
    if (data?.fcmTokens) {
      tokens.push(...data.fcmTokens);
    }
  }
  return tokens;
}

// Notification lors d'une nouvelle saisie dans le carnet
export const onDailyLogUpdate = onDocumentUpdated(
  'tenants/{tenantId}/children/{childId}/dailyLogs/{date}',
  async (event) => {
    const { tenantId, childId } = event.params;
    const child = await db.doc(`tenants/${tenantId}/children/${childId}`).get();
    const childData = child.data();
    if (!childData?.parentIds) return;

    const tokens = await getFcmTokens(tenantId, childData.parentIds);
    await sendPush(
      tokens,
      'Nouvelle saisie',
      `Mise à jour du carnet de ${childData.firstName}`,
      { type: 'daily_log', childId, tenantId }
    );
  }
);

// Notification lors d'une annonce globale
export const onAnnouncementCreated = onDocumentCreated(
  'tenants/{tenantId}/announcements/{msgId}',
  async (event) => {
    const { tenantId } = event.params;
    const data = event.data?.data();
    if (!data) return;

    let parentIds: string[];

    if (data.groupId) {
      const children = await db
        .collection(`tenants/${tenantId}/children`)
        .where('groupId', '==', data.groupId)
        .where('enrollmentStatus', '==', 'active')
        .get();
      parentIds = [...new Set(children.docs.flatMap((d) => d.data().parentIds ?? []))];
    } else {
      const members = await db
        .collection(`tenants/${tenantId}/members`)
        .where('role', '==', 'parent')
        .get();
      parentIds = members.docs.map((d) => d.id);
    }

    const tokens = await getFcmTokens(tenantId, parentIds);
    await sendPush(
      tokens,
      data.title,
      data.body,
      { type: 'announcement', msgId: event.params.msgId, tenantId, requiresAck: String(data.requiresAck) }
    );
  }
);

// Notification lors d'un message privé
export const onPrivateMessageCreated = onDocumentCreated(
  'tenants/{tenantId}/privateMessages/{msgId}',
  async (event) => {
    const { tenantId } = event.params;
    const data = event.data?.data();
    if (!data) return;

    const tokens = await getFcmTokens(tenantId, [data.recipientId]);
    await sendPush(
      tokens,
      `Message de ${data.senderName}`,
      data.body,
      { type: 'private_message', msgId: event.params.msgId, tenantId, childId: data.childId }
    );
  }
);

// Résumé carnet du jour — planifié via Cloud Scheduler (cron 18h00)
export const sendDailySummary = onCall<{ tenantId: string }>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentification requise.');
  }

  const { tenantId } = request.data;
  const today = new Date().toISOString().split('T')[0];

  const children = await db
    .collection(`tenants/${tenantId}/children`)
    .where('enrollmentStatus', '==', 'active')
    .get();

  for (const childDoc of children.docs) {
    const logRef = db.doc(`tenants/${tenantId}/children/${childDoc.id}/dailyLogs/${today}`);
    const log = await logRef.get();
    if (!log.exists) continue;

    const childData = childDoc.data();
    const tokens = await getFcmTokens(tenantId, childData.parentIds ?? []);
    await sendPush(
      tokens,
      'Carnet du jour',
      `Le résumé de ${childData.firstName} est disponible.`,
      { type: 'daily_summary', childId: childDoc.id, tenantId, date: today }
    );

    await logRef.update({ summarySent: true });
  }

  return { success: true };
});

// ─── Effacement automatique après départ ─────────────────────────────────────

export const purgeDepartedChild = onCall<{ tenantId: string; childId: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise.');
    }

    const callerRole = request.auth.token.role as UserRole;
    if (!['network_admin', 'director'].includes(callerRole)) {
      throw new HttpsError('permission-denied', 'Rôle insuffisant.');
    }

    const { tenantId, childId } = request.data;
    const batch = db.batch();

    const dailyLogs = await db
      .collection(`tenants/${tenantId}/children/${childId}/dailyLogs`)
      .get();
    dailyLogs.docs.forEach((doc) => batch.delete(doc.ref));

    const photos = await db
      .collection(`tenants/${tenantId}/children/${childId}/photos`)
      .get();
    photos.docs.forEach((doc) => batch.delete(doc.ref));

    const consents = await db
      .collection(`tenants/${tenantId}/consents`)
      .where('childId', '==', childId)
      .get();
    consents.docs.forEach((doc) => batch.delete(doc.ref));

    batch.delete(db.doc(`tenants/${tenantId}/children/${childId}`));
    await batch.commit();

  // Supprimer les fichiers Storage (à compléter avec listAll)
    return { success: true, purgedAt: new Date().toISOString() };
  }
);
