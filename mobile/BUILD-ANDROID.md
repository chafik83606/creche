# Build Android .aab en local (Windows + Android Studio)

EAS `--local` ne fonctionne **pas sur Windows** pour Android.
Utilisez Android Studio à la place.

## 1. Générer le projet Android natif

```powershell
cd C:\Users\ctre2\Documents\creche\mobile
npx expo prebuild --platform android --clean
```

## 2. Ouvrir dans Android Studio

1. Android Studio → **Open** → sélectionnez le dossier `mobile\android`
2. Attendez la fin de **Gradle Sync** (barre en bas)

## 3. Créer le .aab signé

1. Menu **Build** → **Generate Signed App Bundle / APK**
2. Choisissez **Android App Bundle** → **Next**
3. **Create new...** (nouveau keystore) :
   - **Key store path** : `C:\Users\ctre2\Documents\creche\mobile\creche-release.keystore`
   - **Password** : choisissez un mot de passe (notez-le !)
   - **Alias** : `creche`
   - **Validity** : 25 ans
   - Remplissez nom / organisation
4. **Next** → cochez **release** → **Create**

## 4. Récupérer le fichier

Le `.aab` se trouve ici :

```
mobile\android\app\release\app-release.aab
```

(ou chemin indiqué par Android Studio à la fin)

## 5. Uploader sur Play Console

Play Console → **Tests internes** → **Créer une release** → glissez `app-release.aab`

---

## Alternative rapide : APK pour tester sur téléphone (sans Play Store)

```powershell
cd C:\Users\ctre2\Documents\creche\mobile
npx expo run:android --variant release
```

Branchez le téléphone en USB (mode débogage activé) → l'app s'installe directement.

---

## Keystore — important

- **Conservez** `creche-release.keystore` et le mot de passe
- Même keystore obligatoire pour toutes les mises à jour Play Store
- EAS a aussi créé un keystore cloud — vous pouvez le récupérer avec `eas credentials` si besoin
