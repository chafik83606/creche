/**
 * Seed idempotent — données de démo pour présentation client.
 *
 * Usage production (Firebase réel) :
 *   node scripts/seed-tenant.js
 *
 * Usage émulateurs :
 *   USE_EMULATOR=true node scripts/seed-tenant.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'creche-soinzen';
const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, '..', 'firebase', 'service-account.json');
const USE_EMULATOR =
  process.env.USE_EMULATOR === 'true' ||
  (process.env.USE_EMULATOR !== 'false' && !fs.existsSync(SERVICE_ACCOUNT_PATH));

if (USE_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
  admin.initializeApp({ projectId: PROJECT_ID });
} else {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Clé service-account introuvable:', SERVICE_ACCOUNT_PATH);
    process.exit(1);
  }
  admin.initializeApp({
    projectId: PROJECT_ID,
    credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
  });
}

const db = admin.firestore();
const auth = admin.auth();
const ts = () => admin.firestore.FieldValue.serverTimestamp();

const DEMO_PASSWORD = 'Demo2026!';

const TENANTS = [
  {
    id: 'demo-creche',
    name: 'Crèche Les Petits Loups',
    address: '15 rue de la Paix, 75015 Paris',
    subscriptionStatus: 'active',
  },
  {
    id: 'bolto',
    name: 'Bolto',
    address: '55 avenue rental, 83600 Fréjus',
    subscriptionStatus: 'trial',
  },
];

const GROUPS = {
  'demo-creche': [
    { id: 'group-bebes', name: 'Bébés', educatorIds: ['demo-educator-001'] },
    { id: 'group-moyens', name: 'Moyens', educatorIds: ['demo-educator-002'] },
  ],
  bolto: [
    { id: 'bolto-bebes', name: 'Bébés', educatorIds: ['bolto-educator-001'] },
    { id: 'bolto-grands', name: 'Grands', educatorIds: ['bolto-educator-002'] },
  ],
};

const CHILDREN = {
  'demo-creche': [
    {
      id: 'demo-child-001',
      firstName: 'Léa',
      lastName: 'Martin',
      dateOfBirth: '2024-03-15',
      groupId: 'group-bebes',
      parentIds: ['demo-parent-001'],
      allergies: ['lactose'],
    },
    {
      id: 'demo-child-002',
      firstName: 'Lucas',
      lastName: 'Bernard',
      dateOfBirth: '2023-09-20',
      groupId: 'group-moyens',
      parentIds: ['demo-parent-002'],
      allergies: [],
    },
    {
      id: 'demo-child-003',
      firstName: 'Emma',
      lastName: 'Petit',
      dateOfBirth: '2022-11-08',
      groupId: 'group-moyens',
      parentIds: ['demo-parent-003'],
      allergies: ['arachides'],
    },
  ],
  bolto: [
    {
      id: 'bolto-child-001',
      firstName: 'Noah',
      lastName: 'Durand',
      dateOfBirth: '2024-01-10',
      groupId: 'bolto-bebes',
      parentIds: ['bolto-parent-001'],
      allergies: [],
    },
    {
      id: 'bolto-child-002',
      firstName: 'Chloé',
      lastName: 'Moreau',
      dateOfBirth: '2023-05-22',
      groupId: 'bolto-grands',
      parentIds: ['bolto-parent-002'],
      allergies: [],
    },
    {
      id: 'bolto-child-003',
      firstName: 'Hugo',
      lastName: 'Lambert',
      dateOfBirth: '2022-07-03',
      groupId: 'bolto-grands',
      parentIds: ['bolto-parent-003'],
      allergies: ['gluten'],
    },
  ],
};

const USERS = [
  {
    uid: 'demo-admin-001',
    email: 'admin@demo.creche',
    displayName: 'Alex Admin',
    role: 'network_admin',
    tenantIds: ['demo-creche', 'bolto'],
  },
  {
    uid: 'demo-director-001',
    email: 'directeur@demo.creche',
    displayName: 'Jean Directeur',
    role: 'director',
    tenantIds: ['demo-creche'],
  },
  {
    uid: 'demo-educator-001',
    email: 'educateur@demo.creche',
    displayName: 'Marie Dupont',
    role: 'educator',
    tenantIds: ['demo-creche'],
    groupIds: ['group-bebes'],
  },
  {
    uid: 'demo-educator-002',
    email: 'educateur2@demo.creche',
    displayName: 'Paul Rousseau',
    role: 'educator',
    tenantIds: ['demo-creche'],
    groupIds: ['group-moyens'],
  },
  {
    uid: 'demo-parent-001',
    email: 'parent@demo.creche',
    displayName: 'Sophie Martin',
    role: 'parent',
    tenantIds: ['demo-creche'],
    childIds: ['demo-child-001'],
  },
  {
    uid: 'demo-parent-002',
    email: 'parent2@demo.creche',
    displayName: 'Thomas Bernard',
    role: 'parent',
    tenantIds: ['demo-creche'],
    childIds: ['demo-child-002'],
  },
  {
    uid: 'demo-parent-003',
    email: 'parent3@demo.creche',
    displayName: 'Julie Petit',
    role: 'parent',
    tenantIds: ['demo-creche'],
    childIds: ['demo-child-003'],
  },
  {
    uid: 'bolto-director-001',
    email: 'directeur.bolto@demo.creche',
    displayName: 'Claire Directrice',
    role: 'director',
    tenantIds: ['bolto'],
  },
  {
    uid: 'bolto-educator-001',
    email: 'educateur.bolto@demo.creche',
    displayName: 'Nadia Benali',
    role: 'educator',
    tenantIds: ['bolto'],
    groupIds: ['bolto-bebes'],
  },
  {
    uid: 'bolto-educator-002',
    email: 'educateur2.bolto@demo.creche',
    displayName: 'Marc Lefèvre',
    role: 'educator',
    tenantIds: ['bolto'],
    groupIds: ['bolto-grands'],
  },
  {
    uid: 'bolto-parent-001',
    email: 'parent.bolto@demo.creche',
    displayName: 'Isabelle Durand',
    role: 'parent',
    tenantIds: ['bolto'],
    childIds: ['bolto-child-001'],
  },
  {
    uid: 'bolto-parent-002',
    email: 'parent2.bolto@demo.creche',
    displayName: 'Karim Moreau',
    role: 'parent',
    tenantIds: ['bolto'],
    childIds: ['bolto-child-002'],
  },
  {
    uid: 'bolto-parent-003',
    email: 'parent3.bolto@demo.creche',
    displayName: 'Sandrine Lambert',
    role: 'parent',
    tenantIds: ['bolto'],
    childIds: ['bolto-child-003'],
  },
];

const ANNOUNCEMENTS = {
  'demo-creche': [
    {
      id: 'annonce-bienvenue',
      title: 'Bienvenue sur Crèche Connect !',
      body: 'Bienvenue dans l\'application de la crèche Les Petits Loups. Vous y trouverez le carnet de liaison, les annonces et la messagerie.',
      requiresAck: false,
      senderId: 'demo-director-001',
      senderName: 'Jean Directeur',
    },
    {
      id: 'annonce-fermeture',
      title: 'Fermeture exceptionnelle le 4 août',
      body: 'En raison de la canicule, la crèche sera exceptionnellement fermée le lundi 4 août 2026. Merci de votre compréhension.',
      requiresAck: true,
      senderId: 'demo-director-001',
      senderName: 'Jean Directeur',
    },
    {
      id: 'annonce-sortie',
      title: 'Sortie à la ferme pédagogique',
      body: 'Le groupe Moyens part à la ferme vendredi prochain. Pensez à signer l\'autorisation dans l\'onglet Consentements.',
      requiresAck: false,
      senderId: 'demo-director-001',
      senderName: 'Jean Directeur',
    },
  ],
  bolto: [
    {
      id: 'annonce-bienvenue',
      title: 'Bienvenue à Bolto !',
      body: 'L\'équipe Bolto est ravie de vous accueillir sur Crèche Connect. N\'hésitez pas à nous écrire via Messages.',
      requiresAck: false,
      senderId: 'bolto-director-001',
      senderName: 'Claire Directrice',
    },
    {
      id: 'annonce-portes-ouvertes',
      title: 'Portes ouvertes samedi 10h',
      body: 'Venez découvrir nos locaux et rencontrer l\'équipe éducative ce samedi de 10h à 12h.',
      requiresAck: true,
      senderId: 'bolto-director-001',
      senderName: 'Claire Directrice',
    },
  ],
};

async function upsertAuthUser(user) {
  try {
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: DEMO_PASSWORD,
      displayName: user.displayName,
    });
    console.log(`  ✓ Auth créé: ${user.email}`);
  } catch (err) {
    if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
      await auth.updateUser(user.uid, {
        password: DEMO_PASSWORD,
        displayName: user.displayName,
      });
      console.log(`  ↳ Auth mis à jour: ${user.email}`);
    } else {
      throw err;
    }
  }

  let mergedTenantIds = user.tenantIds;
  try {
    const existing = await auth.getUser(user.uid);
    const prev = existing.customClaims?.tenantIds ?? [];
    mergedTenantIds = Array.from(new Set([...prev, ...user.tenantIds]));
  } catch {
    // ignore
  }

  const claims = {
    role: user.role,
    tenantIds: mergedTenantIds,
    ...(user.groupIds && { groupIds: user.groupIds }),
    ...(user.childIds && { childIds: user.childIds }),
  };
  await auth.setCustomUserClaims(user.uid, claims);
}

async function seedTenant(tenant) {
  await db.doc(`tenants/${tenant.id}`).set(
    {
      id: tenant.id,
      name: tenant.name,
      address: tenant.address,
      subscriptionStatus: tenant.subscriptionStatus,
      updatedAt: ts(),
      createdAt: ts(),
    },
    { merge: true }
  );
  console.log(`✓ Crèche: ${tenant.name} (${tenant.id})`);

  for (const group of GROUPS[tenant.id] ?? []) {
    await db.doc(`tenants/${tenant.id}/groups/${group.id}`).set(
      {
        id: group.id,
        name: group.name,
        educatorIds: group.educatorIds,
        createdAt: ts(),
      },
      { merge: true }
    );
  }
  console.log(`  ✓ ${(GROUPS[tenant.id] ?? []).length} groupes`);

  for (const child of CHILDREN[tenant.id] ?? []) {
    await db.doc(`tenants/${tenant.id}/children/${child.id}`).set(
      {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        dateOfBirth: admin.firestore.Timestamp.fromDate(new Date(child.dateOfBirth)),
        groupId: child.groupId,
        parentIds: child.parentIds,
        allergies: child.allergies,
        enrollmentStatus: 'active',
        createdAt: ts(),
        updatedAt: ts(),
      },
      { merge: true }
    );

    const today = new Date().toISOString().split('T')[0];
    await db.doc(`tenants/${tenant.id}/children/${child.id}/dailyLogs/${today}`).set(
      {
        date: today,
        meals: [
          {
            id: 'meal-1',
            time: admin.firestore.Timestamp.fromDate(new Date(`${today}T08:30:00`)),
            type: 'breakfast',
            quantity: 'half',
            accepted: true,
            recordedBy: GROUPS[tenant.id]?.[0]?.educatorIds?.[0] ?? 'demo-educator-001',
          },
          {
            id: 'meal-2',
            time: admin.firestore.Timestamp.fromDate(new Date(`${today}T12:00:00`)),
            type: 'lunch',
            quantity: 'all',
            accepted: true,
            recordedBy: GROUPS[tenant.id]?.[0]?.educatorIds?.[0] ?? 'demo-educator-001',
          },
        ],
        naps: [
          {
            id: 'nap-1',
            sleepTime: admin.firestore.Timestamp.fromDate(new Date(`${today}T13:00:00`)),
            wakeTime: admin.firestore.Timestamp.fromDate(new Date(`${today}T15:00:00`)),
            quality: 'good',
            recordedBy: GROUPS[tenant.id]?.[0]?.educatorIds?.[0] ?? 'demo-educator-001',
          },
        ],
        activities: [
          {
            id: 'act-1',
            time: admin.firestore.Timestamp.fromDate(new Date(`${today}T10:30:00`)),
            category: 'motor',
            description: 'Parcours de motricité',
            recordedBy: GROUPS[tenant.id]?.[0]?.educatorIds?.[0] ?? 'demo-educator-001',
          },
        ],
        healthNotes: `${child.firstName} va bien aujourd'hui.`,
        updatedAt: ts(),
      },
      { merge: true }
    );
  }
  console.log(`  ✓ ${(CHILDREN[tenant.id] ?? []).length} enfants + carnets du jour`);

  for (const ann of ANNOUNCEMENTS[tenant.id] ?? []) {
    await db.doc(`tenants/${tenant.id}/announcements/${ann.id}`).set(
      {
        type: 'announcement',
        title: ann.title,
        body: ann.body,
        senderId: ann.senderId,
        senderName: ann.senderName,
        groupId: null,
        requiresAck: ann.requiresAck,
        createdAt: ts(),
      },
      { merge: true }
    );
  }
  console.log(`  ✓ ${(ANNOUNCEMENTS[tenant.id] ?? []).length} annonces`);
}

async function seedMembers() {
  for (const user of USERS) {
    await upsertAuthUser(user);

    for (const tenantId of user.tenantIds) {
      const memberRef = db.doc(`tenants/${tenantId}/members/${user.uid}`);
      const existing = await memberRef.get();
      await memberRef.set(
        {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          groupIds: user.groupIds ?? [],
          childIds: user.childIds ?? [],
          fcmTokens: existing.data()?.fcmTokens ?? [],
          updatedAt: ts(),
          ...(existing.exists ? {} : { createdAt: ts() }),
        },
        { merge: true }
      );
    }
    console.log(`✓ Membre: ${user.email} (${user.role})`);
  }
}

async function removeDuplicateWelcomeAnnouncements() {
  for (const tenant of TENANTS) {
    const snap = await db.collection(`tenants/${tenant.id}/announcements`).get();
    const welcomeDocs = snap.docs.filter((d) => {
      const title = d.data().title ?? '';
      return (
        title.includes('Bienvenue') &&
        d.id !== 'annonce-bienvenue'
      );
    });
    for (const docSnap of welcomeDocs) {
      await docSnap.ref.delete();
      console.log(`  🗑 Doublon supprimé: ${docSnap.id} (${tenant.id})`);
    }
  }
}

async function seed() {
  console.log(`🌱 Seed idempotent — projet ${PROJECT_ID}\n`);

  for (const tenant of TENANTS) {
    await seedTenant(tenant);
  }

  await seedMembers();
  await removeDuplicateWelcomeAnnouncements();

  console.log('\n✅ Seed terminé !\n');
  console.log('Comptes de démo (mot de passe: Demo2026!) :\n');
  console.log('  Admin réseau  : admin@demo.creche');
  console.log('  Directeur LP  : directeur@demo.creche');
  console.log('  Éducateur LP  : educateur@demo.creche');
  console.log('  Parent (Léa)  : parent@demo.creche');
  console.log('  Parent (Lucas): parent2@demo.creche');
  console.log('  Directeur Bolto: directeur.bolto@demo.creche');
  console.log('  Parent Bolto  : parent.bolto@demo.creche');
  console.log('\nCrèches : demo-creche (Paris), bolto (Fréjus)');
}

seed().catch((err) => {
  console.error('❌ Erreur seed:', err);
  process.exit(1);
});
