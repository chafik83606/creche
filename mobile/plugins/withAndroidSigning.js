const {
  withAppBuildGradle,
  createRunOncePlugin,
} = require('@expo/config-plugins');

/**
 * Configure release signing from keystore.properties (local)
 * or Codemagic CM_* env vars (CI).
 */
function withAndroidSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes('CRECHE_ANDROID_SIGNING')) {
      return config;
    }

    const helpers = `
// CRECHE_ANDROID_SIGNING
def crecheKeystorePropertiesFile = rootProject.file("keystore.properties")
def crecheKeystoreProperties = new Properties()
if (crecheKeystorePropertiesFile.exists()) {
    crecheKeystoreProperties.load(new FileInputStream(crecheKeystorePropertiesFile))
}

`;

    contents = contents.replace('android {', `${helpers}android {`);

    if (!contents.includes('signingConfigs {')) {
      throw new Error('withAndroidSigning: signingConfigs block not found');
    }

    contents = contents.replace(
      /signingConfigs \{\s*debug \{[\s\S]*?\n        \}\n    \}/m,
      (match) => {
        if (match.includes('release {')) return match;
        return match.replace(
          /\n    \}$/,
          `
        release {
            if (System.getenv("CI") && System.getenv("CM_KEYSTORE_PATH")) {
                storeFile file(System.getenv("CM_KEYSTORE_PATH"))
                storePassword System.getenv("CM_KEYSTORE_PASSWORD")
                keyAlias System.getenv("CM_KEY_ALIAS")
                keyPassword System.getenv("CM_KEY_PASSWORD")
            } else if (crecheKeystorePropertiesFile.exists()) {
                keyAlias crecheKeystoreProperties['keyAlias']
                keyPassword crecheKeystoreProperties['keyPassword']
                storeFile rootProject.file(crecheKeystoreProperties['storeFile'])
                storePassword crecheKeystoreProperties['storePassword']
            }
        }
    }`
        );
      }
    );

    // Only swap signing in buildTypes.release (not debug, not signingConfigs.release)
    contents = contents.replace(
      /(buildTypes\s*\{[\s\S]*?\n\s*release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig signingConfigs.release`
    );

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = createRunOncePlugin(
  withAndroidSigning,
  'withAndroidSigning',
  '1.0.0'
);
