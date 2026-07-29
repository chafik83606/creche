import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function getAppVersionLabel(): string {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : String(Constants.expoConfig?.android?.versionCode ?? '');

  return build ? `${version}(${build})` : version;
}
