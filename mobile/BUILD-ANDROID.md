# Build Android .aab (Windows + Android Studio / Gradle)

## Prérequis

- Keystore local : `mobile/creche-release.keystore` (déjà généré, **ne pas committer**)
- Credentials : `mobile/android/keystore.properties` (gitignored)
- Mot de passe de secours : `mobile/.keystore-pass.tmp` (gitignored) — **sauvegardez-le hors du repo**

## 1. Générer le projet Android natif

```powershell
cd C:\Users\ctre2\Documents\creche\mobile
npx expo prebuild --platform android --clean
```

Si `keystore.properties` a disparu après `--clean`, recréez-le :

```
storeFile=../creche-release.keystore
storePassword=<votre-mot-de-passe>
keyAlias=creche
keyPassword=<votre-mot-de-passe>
```

## 2. Builder le .aab (CLI)

Sur Windows, utilisez un cache Gradle court pour éviter l’erreur « Filename longer than 260 characters » :

```powershell
$env:GRADLE_USER_HOME = 'C:\g'
cd C:\Users\ctre2\Documents\creche\mobile\android
.\gradlew.bat bundleRelease
```

Fichier produit :

```
mobile\android\app\build\outputs\bundle\release\app-release.aab
```

## 3. Ou via Android Studio

1. Open → `mobile\android`
2. **Build** → **Generate Signed App Bundle / APK**
3. Choisissez le keystore existant `mobile\creche-release.keystore`
   - Alias : `creche`
   - Mot de passe : celui de `keystore.properties`

## 4. Uploader sur Play Console

Play Console → **Tests internes** → **Créer une release** → glissez `app-release.aab`

---

## Keystore — important

- **Conservez** `creche-release.keystore` + mot de passe
- Même keystore obligatoire pour toutes les mises à jour Play Store
- Pour Codemagic : uploadez le keystore dans **Code signing identities** et référencez-le dans `codemagic.yaml` (`android_signing`)
