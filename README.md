# Crèche — Application SaaS multi-établissements

Application mobile (React Native / Expo) + web (Next.js) pour le suivi quotidien des enfants en crèche.

## Structure du projet

```
creche/
├── mobile/          # React Native (Expo) — saisie éducateurs + consultation parents
├── web/             # Next.js — consultation parents (carnet + messagerie)
├── shared/          # Types, constantes, chemins Firestore partagés
├── firebase/        # Règles de sécurité, indexes, Cloud Functions
└── scripts/         # Seed de données de démo
```

## Démarrage rapide (local avec émulateurs)

### Prérequis

- Node.js 20+
- Java (pour l'émulateur Firestore)
- Firebase CLI : `npm install -g firebase-tools`

### 1. Installation

```bash
npm install
npm run functions:build
```

### 2. Lancer les émulateurs Firebase

```bash
npm run firebase:emulators
```

Interface émulateurs : http://localhost:4000

### 3. Peupler les données de démo

Dans un autre terminal :

```bash
npm run seed
```

### 4. Lancer le web

```bash
npm run web
```

Ouvrir http://localhost:3000/login

### 5. Lancer le mobile

```bash
npm run mobile
```

Scanner le QR code avec Expo Go.

## Production Firebase (`creche-soinzen`)

Projet créé : **creche-soinzen** (Firestore `europe-west9` / Paris).

Voir le guide complet : [`firebase/PRODUCTION.md`](firebase/PRODUCTION.md)

### Déjà fait
- Projet Firebase + apps Web / Android / iOS
- Firestore en région Paris + règles + indexes déployés
- Config FCM côté mobile (`notifications.ts` + `google-services.json`)
- Cloud Functions FCM prêtes (`europe-west9`)

### À faire manuellement (console)
1. **Passer en plan Blaze** (requis pour Cloud Functions) : https://console.firebase.google.com/project/creche-soinzen/usage/details
2. **Activer Auth Email/Password** : https://console.firebase.google.com/project/creche-soinzen/authentication/providers
3. **iOS APNs** : uploader la clé `.p8` dans Cloud Messaging
4. Déployer les functions : `cd firebase && firebase deploy --only functions`
5. Copier les env prod : `cp mobile/.env.production mobile/.env` et `cp web/.env.production web/.env.local`

## Comptes de test (émulateurs)

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| Directeur | directeur@demo.creche | Demo2026! |
| Éducateur | educateur@demo.creche | Demo2026! |
| Parent | parent@demo.creche | Demo2026! |

**Tenant ID** : `demo-creche`  
**Enfant** : Léa Martin (`demo-child-001`)

## Déploiement production (AWS Paris / HDS)

1. Créer un projet Firebase en région **europe-west9** (Paris)
2. Copier les clés dans `.env.example` → `mobile/.env` et `web/.env.local`
3. Mettre `EXPO_PUBLIC_USE_EMULATORS=false` et `NEXT_PUBLIC_USE_EMULATORS=false`
4. Déployer :

```bash
cd firebase
firebase deploy --only firestore:rules,storage,functions,firestore:indexes
```

5. Seed production (avec service account) :

```bash
USE_EMULATOR=false FIREBASE_PROJECT_ID=votre-projet node scripts/seed-tenant.js
```

## Architecture Firestore (multi-tenant)

```
tenants/{tenantId}
├── members/{uid}
├── groups/{groupId}
├── children/{childId}
│   ├── dailyLogs/{YYYY-MM-DD}
│   └── photos/{photoId}
├── announcements/{msgId}
│   └── acks/{parentId}
├── privateMessages/{msgId}
├── consents/{consentId}
└── invitations/{inviteId}
```

## Rôles (Custom Claims Firebase Auth)

| Rôle | Claims | Accès |
|------|--------|-------|
| `network_admin` | tenantIds | Tous les établissements |
| `director` | tenantIds | Son établissement |
| `educator` | tenantIds, groupIds | Ses groupes |
| `parent` | tenantIds, childIds | Ses enfants |

## Pages web

| Route | Description |
|-------|-------------|
| `/login` | Connexion parent |
| `/dashboard` | Carnet du jour (lecture seule) |
| `/dashboard/messages` | Annonces de la crèche |
| `/dashboard/chat` | Messages privés éducateur ↔ parent |

## MVP jeudi — checklist

- [x] Structure monorepo
- [x] Types Firestore partagés
- [x] Règles de sécurité multi-tenant
- [x] Cloud Functions (auth, FCM, purge)
- [x] App mobile Expo (auth, carnet, annonces, consentements)
- [x] App web Next.js (carnet, annonces, chat)
- [x] Script seed + émulateurs
- [ ] Projet Firebase production (europe-west9)
- [ ] Notifications push FCM (config APNs + clé serveur)
- [ ] Build EAS (iOS + Android)
- [ ] Tests bout-en-bout sur device réel
