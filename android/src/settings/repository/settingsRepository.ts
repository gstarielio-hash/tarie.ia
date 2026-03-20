import * as FileSystem from "expo-file-system/legacy";

import { APP_PREFERENCES_FILE } from "../../features/InspectorMobileApp.constants";
import { createDefaultSettingsDocument } from "../schema/defaults";
import {
  SETTINGS_SCHEMA_VERSION,
  type AppSettings,
  type PersistedSettingsDocument,
} from "../schema/types";
import { migrateSettingsDocument } from "../migrations/migrateSettingsDocument";

async function writeDocument(document: PersistedSettingsDocument): Promise<void> {
  await FileSystem.writeAsStringAsync(APP_PREFERENCES_FILE, JSON.stringify(document));
}

export async function loadSettingsDocument(): Promise<PersistedSettingsDocument> {
  try {
    const raw = await FileSystem.readAsStringAsync(APP_PREFERENCES_FILE);
    const document = migrateSettingsDocument(JSON.parse(raw));
    await writeDocument(document);
    return document;
  } catch {
    const fallback = createDefaultSettingsDocument();
    await writeDocument(fallback);
    return fallback;
  }
}

export async function saveSettingsDocument(settings: AppSettings): Promise<PersistedSettingsDocument> {
  const document: PersistedSettingsDocument = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    settings,
  };
  await writeDocument(document);
  return document;
}

export async function resetSettingsDocument(): Promise<PersistedSettingsDocument> {
  const fallback = createDefaultSettingsDocument();
  await writeDocument(fallback);
  return fallback;
}
