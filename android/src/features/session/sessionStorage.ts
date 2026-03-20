import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";

import {
  APP_PREFERENCES_FILE,
  EMAIL_KEY,
  HISTORY_UI_STATE_FILE,
  NOTIFICATIONS_FILE,
  OFFLINE_QUEUE_FILE,
  READ_CACHE_FILE,
} from "../InspectorMobileApp.constants";

export async function readSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.warn(`Falha ao ler SecureStore (${key})`, error);
    return null;
  }
}

export async function writeSecureItem(
  key: string,
  value: string,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.warn(`Falha ao salvar SecureStore (${key})`, error);
  }
}

export async function removeSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.warn(`Falha ao remover SecureStore (${key})`, error);
  }
}

export async function clearPersistedAccountData(): Promise<void> {
  await Promise.all([
    removeSecureItem(EMAIL_KEY),
    FileSystem.deleteAsync(OFFLINE_QUEUE_FILE, { idempotent: true }),
    FileSystem.deleteAsync(NOTIFICATIONS_FILE, { idempotent: true }),
    FileSystem.deleteAsync(READ_CACHE_FILE, { idempotent: true }),
    FileSystem.deleteAsync(HISTORY_UI_STATE_FILE, { idempotent: true }),
    FileSystem.deleteAsync(APP_PREFERENCES_FILE, { idempotent: true }),
  ]);
}
