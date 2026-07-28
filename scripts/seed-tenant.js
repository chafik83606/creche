/**
 * Script de seed pour créer un tenant de démo avec données initiales.
 *
 * Usage avec émulateurs :
 *   1. firebase emulators:start
 *   2. node scripts/seed-tenant.js
 *
 * Usage avec projet Firebase réel :
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/seed-tenant.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-creche';
const USE_EMULATOR = process.env.USE_EMULATOR !== 'false';
const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, '..', 'firebase', 'service-account.json');

if (USE_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
  admin.initializeApp({ projectId: PROJECT_ID });
} else {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Clé de compte de service introuvable.\n');
    console.error('Pour seed en production :');
    console.error('  1. Firebase Console → Paramètres → Comptes de service');
    console.error('  2. « Générer une nouvelle clé privée » → enregistrer le JSON');
    console.error('  3. Placer le fichier ici : firebase/service-account.json');
    console.error('  4. Relancer : node scripts/seed-tenant.js\n');
    console.error('URL : https://console.firebase.google.com/project/creche-soinzen/settings/serviceaccounts/adminsdk');
    process.exit(1);
  }
  admin.initializeApp({
    projectId: PROJECT_ID,
    credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
  });
}
const db = admin.firestore();
const auth = admin.auth();

const TENANT_ID = 'demo-creche';
const GROUP_ID = 'group-bebes';
const CHILD_ID = 'demo-child-001';

const USERS = [
  {
    email: 'directeur@demo.creche',
    password: 'Demo2026!',
    displayName: 'Jean Directeur',
    role: 'director',
    uid: 'demo-director-001',
  },
  {
    email: 'educateur@demo.creche',
    password: 'Demo2026!',
    displayName: 'Marie Dupont',
    role: 'educator',
    uid: 'demo-educator-001',
    groupIds: [GROUP_ID],
  },
  {
    email: 'parent@demo.creche',
    password: 'Demo2026!',
    displayName: 'Sophie Martin',
    role: 'parent',
    uid: 'demo-parent-001',
    childIds: [CHILD_ID],
  },
];

async function seed() {
  console.log('🌱 Seed du tenant de démo...\n');

  // 1. Tenant
  await db.doc(`tenants/${TENANT_ID}`).set({
    id: TENANT_ID,
    name: 'Crèche Les Petits Loups',
    address: '15 rue de la Paix, 75015 Paris',
    subscriptionStatus: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('✓ Tenant créé:', TENANT_ID);

  // 2. Groupe
  await db.doc(`tenants/${TENANT_ID}/groups/${GROUP_ID}`).set({
    id: GROUP_ID,
    name: 'Bébés',
    educatorIds: ['demo-educator-001'],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('✓ Groupe créé:', GROUP_ID);

  // 3. Enfant
  await db.doc(`tenants/${TENANT_ID}/children/${CHILD_ID}`).set({
    id: CHILD_ID,
    firstName: 'Léa',
    lastName: 'Martin',
    dateOfBirth: new Date('2024-03-15'),
    groupId: GROUP_ID,
    parentIds: ['demo-parent-001'],
    allergies: ['lactose'],
    enrollmentStatus: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('✓ Enfant créé:', CHILD_ID, '(Léa Martin)');

  // 4. Utilisateurs Auth + claims + members
  for (const user of USERS) {
    try {
      await auth.createUser({
        uid: user.uid,
        email: user.email,
        password: user.password,
        displayName: user.displayName,
      });
    } catch (err) {
      if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
        console.log(`  ↳ Utilisateur ${user.email} existe déjà, mise à jour...`);
      } else {
        throw err;
      }
    }

    const claims = {
      role: user.role,
      tenantIds: [TENANT_ID],
      ...(user.groupIds && { groupIds: user.groupIds }),
      ...(user.childIds && { childIds: user.childIds }),
    };
    await auth.setCustomUserClaims(user.uid, claims);

    await db.doc(`tenants/${TENANT_ID}/members/${user.uid}`).set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      groupIds: user.groupIds ?? [],
      childIds: user.childIds ?? [],
      fcmTokens: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✓ Utilisateur créé: ${user.email} (${user.role})`);
  }

  // 5. Annonce de bienvenue
  await db.collection(`tenants/${TENANT_ID}/announcements`).add({
    type: 'announcement',
    title: 'Bienvenue sur l\'application Crèche !',
    body: 'Cette annonce de test confirme que la messagerie fonctionne. Bonne journée à tous !',
    senderId: 'demo-director-001',
    senderName: 'Jean Directeur',
    groupId: null,
    requiresAck: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('✓ Annonce de bienvenue créée');

  console.log('\n✅ Seed terminé !\n');
  console.log('Comptes de test :');
  console.log('  Directeur  : directeur@demo.creche / Demo2026!');
  console.log('  Éducateur  : educateur@demo.creche / Demo2026!');
  console.log('  Parent     : parent@demo.creche / Demo2026!');
  console.log('\nTenant ID    :', TENANT_ID);
  console.log('Child ID     :', CHILD_ID);
}

seed().catch((err) => {
  console.error('❌ Erreur seed:', err);
  process.exit(1);
});
