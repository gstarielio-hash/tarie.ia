import type {
  ACCENT_OPTIONS,
  AI_MODEL_OPTIONS,
  APP_LANGUAGE_OPTIONS,
  BATTERY_OPTIONS,
  CONVERSATION_TONE_OPTIONS,
  DATA_RETENTION_OPTIONS,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LOCK_TIMEOUT_OPTIONS,
  MEDIA_COMPRESSION_OPTIONS,
  NOTIFICATION_SOUND_OPTIONS,
  REGION_OPTIONS,
  RESPONSE_LANGUAGE_OPTIONS,
  RESPONSE_STYLE_OPTIONS,
  SPEECH_LANGUAGE_OPTIONS,
  THEME_OPTIONS,
} from "./options";

export const SETTINGS_SCHEMA_VERSION = 2 as const;

export type SettingsTheme = (typeof THEME_OPTIONS)[number];
export type SettingsDensity = (typeof DENSITY_OPTIONS)[number];
export type SettingsFontScale = (typeof FONT_SIZE_OPTIONS)[number];
export type SettingsAccentColor = (typeof ACCENT_OPTIONS)[number];
export type SettingsAiModel = (typeof AI_MODEL_OPTIONS)[number];
export type SettingsResponseStyle = (typeof RESPONSE_STYLE_OPTIONS)[number];
export type SettingsResponseLanguage = (typeof RESPONSE_LANGUAGE_OPTIONS)[number];
export type SettingsConversationTone = (typeof CONVERSATION_TONE_OPTIONS)[number];
export type SettingsSpeechLanguage = (typeof SPEECH_LANGUAGE_OPTIONS)[number];
export type SettingsNotificationSound = (typeof NOTIFICATION_SOUND_OPTIONS)[number];
export type SettingsMediaCompression = (typeof MEDIA_COMPRESSION_OPTIONS)[number];
export type SettingsRegion = (typeof REGION_OPTIONS)[number];
export type SettingsBatteryMode = (typeof BATTERY_OPTIONS)[number];
export type SettingsAppLanguage = (typeof APP_LANGUAGE_OPTIONS)[number];
export type SettingsLockTimeout = (typeof LOCK_TIMEOUT_OPTIONS)[number];
export type SettingsDataRetention = (typeof DATA_RETENTION_OPTIONS)[number];

export interface AppSettings {
  appearance: {
    theme: SettingsTheme;
    density: SettingsDensity;
    fontScale: SettingsFontScale;
    accentColor: SettingsAccentColor;
    animationsEnabled: boolean;
  };
  ai: {
    model: SettingsAiModel;
    responseStyle: SettingsResponseStyle;
    responseLanguage: SettingsResponseLanguage;
    memoryEnabled: boolean;
    learningOptIn: boolean;
    tone: SettingsConversationTone;
    temperature: number;
  };
  notifications: {
    pushEnabled: boolean;
    responseAlertsEnabled: boolean;
    soundEnabled: boolean;
    vibrationEnabled: boolean;
    emailEnabled: boolean;
    soundPreset: SettingsNotificationSound;
    showMessageContent: boolean;
    hideContentOnLockScreen: boolean;
    onlyShowNewMessage: boolean;
    chatCategoryEnabled: boolean;
    mesaCategoryEnabled: boolean;
    systemCategoryEnabled: boolean;
    criticalAlertsEnabled: boolean;
  };
  speech: {
    enabled: boolean;
    autoTranscribe: boolean;
    autoReadResponses: boolean;
    voiceLanguage: SettingsSpeechLanguage;
    speechRate: number;
    voiceId: string;
  };
  dataControls: {
    analyticsOptIn: boolean;
    crashReportsOptIn: boolean;
    wifiOnlySync: boolean;
    chatHistoryEnabled: boolean;
    deviceBackupEnabled: boolean;
    crossDeviceSyncEnabled: boolean;
    retention: SettingsDataRetention;
    autoUploadAttachments: boolean;
    mediaCompression: SettingsMediaCompression;
  };
  system: {
    language: SettingsAppLanguage;
    region: SettingsRegion;
    dataSaver: boolean;
    batteryMode: SettingsBatteryMode;
  };
  account: {
    fullName: string;
    displayName: string;
    email: string;
    phone: string;
    photoUri: string;
    photoHint: string;
  };
  attachments: {
    enabled: boolean;
  };
  security: {
    microphonePermission: boolean;
    cameraPermission: boolean;
    filesPermission: boolean;
    notificationsPermission: boolean;
    biometricsPermission: boolean;
    deviceBiometricsEnabled: boolean;
    requireAuthOnOpen: boolean;
    hideInMultitask: boolean;
    lockTimeout: SettingsLockTimeout;
  };
}

export interface PersistedSettingsDocument {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  updatedAt: string;
  settings: AppSettings;
}
