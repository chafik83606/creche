# Firebase Production — Creche SoinZen

**Project ID** : `creche-soinzen`  
**Console** : https://console.firebase.google.com/project/creche-soinzen/overview

## Apps créées

| Plateforme | App ID | Identifiant |
|------------|--------|-------------|
| Web | `1:213510187132:web:b1bee61e1f1e76ea3ac1f9` | Creche Web |
| Android | `1:213510187132:android:164fd2a61f1b323d3ac1f9` | `fr.creche.app` |
| iOS | `1:213510187132:ios:19c48bd447ca7a673ac1f9` | `fr.creche.app` |

## Checklist activation manuelle (console)

### 1. Activer Cloud Firestore API

Ouvrir : https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=creche-soinzen

Cliquer **Activer**, puis créer la base :

```bash
cd firebase
firebase firestore:databases:create "(default)" --location=europe-west9 --project creche-soinzen
```

> Région **europe-west9** = Paris (exigence HDS).

### 2. Activer Authentication (Email/Password)

1. Console → Authentication → Get started
2. Sign-in method → Email/Password → Enable

### 3. Activer Storage

```bash
firebase storage --project creche-soinzen
```

Ou Console → Storage → Get started → région `europe-west9`.

### 4. Notifications push FCM

#### Android
- FCM est actif dès la création de l'app Android.
- Pour un build natif Expo : télécharger `google-services.json` :
  ```bash
  firebase apps:sdkconfig ANDROID 1:213510187132:android:164fd2a61f1b323d3ac1f9 > mobile/google-services.json
  ```
- Ajouter dans `app.json` :
  ```json
  "android": { "googleServicesFile": "./google-services.json" }
  ```

#### iOS (APNs — obligatoire pour push iOS)
1. Apple Developer → Keys → créer une clé **APNs**
2. Firebase Console → Project Settings → Cloud Messaging → iOS app
3. Upload la clé `.p8` (Key ID + Team ID)
4. Télécharger `GoogleService-Info.plist` :
   ```bash
   firebase apps:sdkconfig IOS 1:213510187132:ios:19c48bd447ca7a673ac1f9 > mobile/GoogleService-Info.plist
   ```

> **Note Expo Go** : les push natives FCM ne fonctionnent pas dans Expo Go.
> Utiliser un **development build** (`eas build --profile development`) ou un build production.

### 5. Déployer règles + functions

```bash
cd firebase
firebase use creche-soinzen
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

### 6. Passer les apps en production

```bash
# Mobile
cp mobile/.env.production mobile/.env

# Web
cp web/.env.production web/.env.local
```

## Flux push (déjà codé)

```
Événement Firestore
  → Cloud Function (europe-west9)
    → lit members/{uid}.fcmTokens
      → admin.messaging().sendEachForMulticast()
        → device parent/éducateur
```

| Trigger | Function | Destinataires |
|---------|----------|---------------|
| Update carnet | `onDailyLogUpdate` | Parents de l'enfant |
| Nouvelle annonce | `onAnnouncementCreated` | Parents (tous / groupe) |
| Message privé | `onPrivateMessageCreated` | Destinataire |
| Cron 18h | `sendDailySummary` | Parents (résumé) |

Côté mobile : `registerForPushNotifications()` enregistre le token device dans `members/{uid}.fcmTokens` à la connexion.
