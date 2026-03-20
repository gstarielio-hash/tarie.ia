import type { AppSettings, PersistedSettingsDocument } from "./types";
import { SETTINGS_SCHEMA_VERSION } from "./types";

export function createDefaultAppSettings(): AppSettings {
  return {
    appearance: {
      theme: "claro",
      density: "confortável",
      fontScale: "médio",
      accentColor: "laranja",
      animationsEnabled: true,
    },
    ai: {
      model: "equilibrado",
      responseStyle: "detalhado",
      responseLanguage: "Português",
      memoryEnabled: true,
      learningOptIn: false,
      tone: "técnico",
      temperature: 0.4,
    },
    notifications: {
      pushEnabled: true,
      responseAlertsEnabled: true,
      soundEnabled: true,
      vibrationEnabled: true,
      emailEnabled: false,
      soundPreset: "Ping",
      showMessageContent: false,
      hideContentOnLockScreen: true,
      onlyShowNewMessage: true,
      chatCategoryEnabled: true,
      mesaCategoryEnabled: true,
      systemCategoryEnabled: true,
      criticalAlertsEnabled: true,
    },
    speech: {
      enabled: false,
      autoTranscribe: false,
      autoReadResponses: false,
      voiceLanguage: "Sistema",
      speechRate: 1,
      voiceId: "",
    },
    dataControls: {
      analyticsOptIn: true,
      crashReportsOptIn: false,
      wifiOnlySync: false,
      chatHistoryEnabled: true,
      deviceBackupEnabled: true,
      crossDeviceSyncEnabled: true,
      retention: "90 dias",
      autoUploadAttachments: true,
      mediaCompression: "equilibrada",
    },
    system: {
      language: "Português",
      region: "Brasil",
      dataSaver: false,
      batteryMode: "Otimizado",
    },
    account: {
      fullName: "",
      displayName: "",
      email: "",
      phone: "",
      photoUri: "",
      photoHint: "Toque para atualizar",
    },
    attachments: {
      enabled: true,
    },
    security: {
      microphonePermission: true,
      cameraPermission: true,
      filesPermission: true,
      notificationsPermission: true,
      biometricsPermission: true,
      deviceBiometricsEnabled: false,
      requireAuthOnOpen: true,
      hideInMultitask: true,
      lockTimeout: "1 minuto",
    },
  };
}

export function createDefaultSettingsDocument(): PersistedSettingsDocument {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    settings: createDefaultAppSettings(),
  };
}
