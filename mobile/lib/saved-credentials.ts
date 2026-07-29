import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'creche.saved_login';

type SavedLogin = {
  email: string;
  password: string;
};

export async function loadSavedLogin(): Promise<SavedLogin | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedLogin;
    if (!parsed.email || !parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveLogin(email: string, password: string): Promise<void> {
  const payload: SavedLogin = { email, password };
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(payload));
}

export async function clearSavedLogin(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // ignore
  }
}
