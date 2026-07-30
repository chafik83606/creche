/**
 * Seed carnets fictifs pour Léa Martin (jours précédents).
 *
 *   node scripts/seed-lea-past-logs.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'creche-soinzen';
const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, '..', 'firebase', 'service-account.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('❌ Clé service-account introuvable:', SERVICE_ACCOUNT_PATH);
  process.exit(1);
}

admin.initializeApp({
  projectId: PROJECT_ID,
  credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
});

const db = admin.firestore();
const ts = () => admin.firestore.FieldValue.serverTimestamp();

const TENANT_ID = 'demo-creche';
const CHILD_ID = 'demo-child-001';
const EDUCATOR_ID = 'demo-educator-001';
const DAYS_BACK = 5;

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function at(dateStr, hh, mm) {
  return admin.firestore.Timestamp.fromDate(new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`));
}

const DAY_TEMPLATES = [
  {
    meals: [
      { id: 'meal-bf', type: 'breakfast', quantity: 'half', accepted: true, h: 8, m: 30 },
      { id: 'meal-lu', type: 'lunch', quantity: 'all', accepted: true, h: 12, m: 0 },
      { id: 'meal-sn', type: 'snack', quantity: 'little', accepted: true, h: 16, m: 0 },
    ],
    naps: [{ id: 'nap-1', sleepH: 13, sleepM: 0, wakeH: 14, wakeM: 45, quality: 'good' }],
    activities: [
      { id: 'act-1', category: 'motor', description: 'Parcours de motricité', h: 10, m: 15 },
      { id: 'act-2', category: 'music', description: 'Chansons et comptines', h: 15, m: 30 },
    ],
    health: [],
    diapers: [
      { id: 'diap-1', type: 'wet', h: 9, m: 10 },
      { id: 'diap-2', type: 'dirty', h: 11, m: 40 },
      { id: 'diap-3', type: 'wet', h: 15, m: 5 },
    ],
  },
  {
    meals: [
      { id: 'meal-bf', type: 'breakfast', quantity: 'all', accepted: true, h: 8, m: 45 },
      { id: 'meal-lu', type: 'lunch', quantity: 'half', accepted: true, h: 12, m: 10 },
      { id: 'meal-sn', type: 'snack', quantity: 'all', accepted: true, h: 16, m: 15 },
    ],
    naps: [{ id: 'nap-1', sleepH: 13, sleepM: 15, wakeH: 15, wakeM: 0, quality: 'average' }],
    activities: [
      { id: 'act-1', category: 'art', description: 'Peinture aux doigts', h: 10, m: 0 },
      { id: 'act-2', category: 'outdoor', description: 'Jeux dans le jardin', h: 11, m: 0 },
    ],
    health: [{ id: 'health-1', temperature: 36.7, notes: 'Forme normale', h: 9, m: 0 }],
    diapers: [
      { id: 'diap-1', type: 'wet', h: 8, m: 50 },
      { id: 'diap-2', type: 'both', h: 12, m: 50 },
      { id: 'diap-3', type: 'wet', h: 16, m: 20 },
    ],
  },
  {
    meals: [
      { id: 'meal-bf', type: 'breakfast', quantity: 'little', accepted: true, h: 8, m: 20 },
      { id: 'meal-lu', type: 'lunch', quantity: 'all', accepted: true, h: 11, m: 55 },
      { id: 'meal-sn', type: 'snack', quantity: 'half', accepted: true, h: 15, m: 45 },
    ],
    naps: [{ id: 'nap-1', sleepH: 12, sleepM: 45, wakeH: 14, wakeM: 30, quality: 'good' }],
    activities: [
      { id: 'act-1', category: 'other', description: 'Lecture d’histoires', h: 9, m: 45 },
      { id: 'act-2', category: 'motor', description: 'Jeux de ballon', h: 15, m: 0 },
    ],
    health: [],
    diapers: [
      { id: 'diap-1', type: 'wet', h: 9, m: 30 },
      { id: 'diap-2', type: 'wet', h: 13, m: 20 },
      { id: 'diap-3', type: 'dirty', h: 16, m: 0 },
    ],
  },
  {
    meals: [
      { id: 'meal-bf', type: 'breakfast', quantity: 'all', accepted: true, h: 8, m: 35 },
      { id: 'meal-lu', type: 'lunch', quantity: 'all', accepted: true, h: 12, m: 5 },
      { id: 'meal-sn', type: 'snack', quantity: 'all', accepted: true, h: 16, m: 5 },
    ],
    naps: [{ id: 'nap-1', sleepH: 13, sleepM: 0, wakeH: 15, wakeM: 10, quality: 'good' }],
    activities: [
      { id: 'act-1', category: 'music', description: 'Atelier instruments', h: 10, m: 30 },
      { id: 'act-2', category: 'art', description: 'Collage papier', h: 14, m: 0 },
    ],
    health: [],
    diapers: [
      { id: 'diap-1', type: 'wet', h: 9, m: 0 },
      { id: 'diap-2', type: 'dirty', h: 11, m: 15 },
      { id: 'diap-3', type: 'wet', h: 14, m: 40 },
    ],
  },
  {
    meals: [
      { id: 'meal-bf', type: 'breakfast', quantity: 'half', accepted: true, h: 8, m: 40 },
      { id: 'meal-lu', type: 'lunch', quantity: 'little', accepted: false, h: 12, m: 0 },
      { id: 'meal-sn', type: 'snack', quantity: 'half', accepted: true, h: 16, m: 10 },
    ],
    naps: [{ id: 'nap-1', sleepH: 13, sleepM: 20, wakeH: 14, wakeM: 20, quality: 'poor' }],
    activities: [
      { id: 'act-1', category: 'outdoor', description: 'Promenade poussette', h: 10, m: 45 },
    ],
    health: [
      {
        id: 'health-1',
        temperature: 37.1,
        notes: 'Un peu fatiguée l’après-midi, surveillée',
        h: 14,
        m: 30,
      },
    ],
    diapers: [
      { id: 'diap-1', type: 'wet', h: 9, m: 15 },
      { id: 'diap-2', type: 'wet', h: 12, m: 30 },
      { id: 'diap-3', type: 'both', h: 15, m: 50 },
    ],
  },
];

function buildLog(dateStr, template, dayIndex) {
  return {
    date: dateStr,
    childId: CHILD_ID,
    meals: template.meals.map((m) => ({
      id: `${dateStr}-${m.id}`,
      time: at(dateStr, m.h, m.m),
      type: m.type,
      quantity: m.quantity,
      accepted: m.accepted,
      recordedBy: EDUCATOR_ID,
    })),
    naps: template.naps.map((n) => ({
      id: `${dateStr}-${n.id}`,
      sleepTime: at(dateStr, n.sleepH, n.sleepM),
      wakeTime: at(dateStr, n.wakeH, n.wakeM),
      quality: n.quality,
      recordedBy: EDUCATOR_ID,
    })),
    activities: template.activities.map((a) => ({
      id: `${dateStr}-${a.id}`,
      time: at(dateStr, a.h, a.m),
      category: a.category,
      description: a.description,
      recordedBy: EDUCATOR_ID,
    })),
    health: template.health.map((h) => ({
      id: `${dateStr}-${h.id}`,
      time: at(dateStr, h.h, h.m),
      temperature: h.temperature,
      notes: h.notes,
      recordedBy: EDUCATOR_ID,
    })),
    diapers: template.diapers.map((d) => ({
      id: `${dateStr}-${d.id}`,
      time: at(dateStr, d.h, d.m),
      type: d.type,
      recordedBy: EDUCATOR_ID,
    })),
    summarySent: true,
    updatedAt: ts(),
    createdAt: ts(),
    _seedNote: `demo-past-day-${dayIndex}`,
  };
}

async function main() {
  const today = new Date();
  console.log(`Seed carnets Léa Martin — ${DAYS_BACK} jours avant ${dateKey(today)}`);

  for (let i = 1; i <= DAYS_BACK; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const template = DAY_TEMPLATES[(i - 1) % DAY_TEMPLATES.length];
    const ref = db.doc(`tenants/${TENANT_ID}/children/${CHILD_ID}/dailyLogs/${key}`);
    await ref.set(buildLog(key, template, i), { merge: true });
    console.log(`  ✓ ${key}`);
  }

  console.log('Terminé.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
