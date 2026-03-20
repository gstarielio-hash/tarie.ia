import {
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
} from "../schema/options";
import { createDefaultAppSettings, createDefaultSettingsDocument } from "../schema/defaults";
import {
  SETTINGS_SCHEMA_VERSION,
  type AppSettings,
  type PersistedSettingsDocument,
} from "../schema/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeOption<T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? value : fallback;
}

function normalizeTemperature(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeSpeechRate(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0.5, Math.min(1.5, Number(value)));
}

function normalizeSettings(input: unknown): AppSettings {
  const fallback = createDefaultAppSettings();
  if (!isRecord(input)) {
    return fallback;
  }

  const appearance = isRecord(input.appearance) ? input.appearance : {};
  const ai = isRecord(input.ai) ? input.ai : {};
  const notifications = isRecord(input.notifications) ? input.notifications : {};
  const speech = isRecord(input.speech) ? input.speech : {};
  const dataControls = isRecord(input.dataControls) ? input.dataControls : {};
  const system = isRecord(input.system) ? input.system : {};
  const account = isRecord(input.account) ? input.account : {};
  const attachments = isRecord(input.attachments) ? input.attachments : {};
  const security = isRecord(input.security) ? input.security : {};

  const soundPreset = normalizeOption(
    notifications.soundPreset,
    NOTIFICATION_SOUND_OPTIONS,
    fallback.notifications.soundPreset,
  );

  return {
    appearance: {
      theme: normalizeOption(appearance.theme, THEME_OPTIONS, fallback.appearance.theme),
      density: normalizeOption(appearance.density, DENSITY_OPTIONS, fallback.appearance.density),
      fontScale: normalizeOption(appearance.fontScale, FONT_SIZE_OPTIONS, fallback.appearance.fontScale),
      accentColor: normalizeOption(appearance.accentColor, ACCENT_OPTIONS, fallback.appearance.accentColor),
      animationsEnabled: normalizeBoolean(
        appearance.animationsEnabled,
        fallback.appearance.animationsEnabled,
      ),
    },
    ai: {
      model: normalizeOption(ai.model, AI_MODEL_OPTIONS, fallback.ai.model),
      responseStyle: normalizeOption(
        ai.responseStyle,
        RESPONSE_STYLE_OPTIONS,
        fallback.ai.responseStyle,
      ),
      responseLanguage: normalizeOption(
        ai.responseLanguage,
        RESPONSE_LANGUAGE_OPTIONS,
        fallback.ai.responseLanguage,
      ),
      memoryEnabled: normalizeBoolean(ai.memoryEnabled, fallback.ai.memoryEnabled),
      learningOptIn: normalizeBoolean(ai.learningOptIn, fallback.ai.learningOptIn),
      tone: normalizeOption(ai.tone, CONVERSATION_TONE_OPTIONS, fallback.ai.tone),
      temperature: normalizeTemperature(ai.temperature, fallback.ai.temperature),
    },
    notifications: {
      pushEnabled: normalizeBoolean(notifications.pushEnabled, fallback.notifications.pushEnabled),
      responseAlertsEnabled: normalizeBoolean(
        notifications.responseAlertsEnabled,
        fallback.notifications.responseAlertsEnabled,
      ),
      soundEnabled: normalizeBoolean(
        notifications.soundEnabled,
        soundPreset !== "Silencioso",
      ),
      vibrationEnabled: normalizeBoolean(
        notifications.vibrationEnabled,
        fallback.notifications.vibrationEnabled,
      ),
      emailEnabled: normalizeBoolean(notifications.emailEnabled, fallback.notifications.emailEnabled),
      soundPreset,
      showMessageContent: normalizeBoolean(
        notifications.showMessageContent,
        fallback.notifications.showMessageContent,
      ),
      hideContentOnLockScreen: normalizeBoolean(
        notifications.hideContentOnLockScreen,
        fallback.notifications.hideContentOnLockScreen,
      ),
      onlyShowNewMessage: normalizeBoolean(
        notifications.onlyShowNewMessage,
        fallback.notifications.onlyShowNewMessage,
      ),
      chatCategoryEnabled: normalizeBoolean(
        notifications.chatCategoryEnabled,
        fallback.notifications.chatCategoryEnabled,
      ),
      mesaCategoryEnabled: normalizeBoolean(
        notifications.mesaCategoryEnabled,
        fallback.notifications.mesaCategoryEnabled,
      ),
      systemCategoryEnabled: normalizeBoolean(
        notifications.systemCategoryEnabled,
        fallback.notifications.systemCategoryEnabled,
      ),
      criticalAlertsEnabled: normalizeBoolean(
        notifications.criticalAlertsEnabled,
        fallback.notifications.criticalAlertsEnabled,
      ),
    },
    speech: {
      enabled: normalizeBoolean(speech.enabled, fallback.speech.enabled),
      autoTranscribe: normalizeBoolean(speech.autoTranscribe, fallback.speech.autoTranscribe),
      autoReadResponses: normalizeBoolean(
        speech.autoReadResponses,
        fallback.speech.autoReadResponses,
      ),
      voiceLanguage: normalizeOption(
        speech.voiceLanguage,
        SPEECH_LANGUAGE_OPTIONS,
        fallback.speech.voiceLanguage,
      ),
      speechRate: normalizeSpeechRate(speech.speechRate, fallback.speech.speechRate),
      voiceId: normalizeString(speech.voiceId, fallback.speech.voiceId),
    },
    dataControls: {
      analyticsOptIn: normalizeBoolean(
        dataControls.analyticsOptIn,
        fallback.dataControls.analyticsOptIn,
      ),
      crashReportsOptIn: normalizeBoolean(
        dataControls.crashReportsOptIn,
        fallback.dataControls.crashReportsOptIn,
      ),
      wifiOnlySync: normalizeBoolean(dataControls.wifiOnlySync, fallback.dataControls.wifiOnlySync),
      chatHistoryEnabled: normalizeBoolean(
        dataControls.chatHistoryEnabled,
        fallback.dataControls.chatHistoryEnabled,
      ),
      deviceBackupEnabled: normalizeBoolean(
        dataControls.deviceBackupEnabled,
        fallback.dataControls.deviceBackupEnabled,
      ),
      crossDeviceSyncEnabled: normalizeBoolean(
        dataControls.crossDeviceSyncEnabled,
        fallback.dataControls.crossDeviceSyncEnabled,
      ),
      retention: normalizeOption(
        dataControls.retention,
        DATA_RETENTION_OPTIONS,
        fallback.dataControls.retention,
      ),
      autoUploadAttachments: normalizeBoolean(
        dataControls.autoUploadAttachments,
        fallback.dataControls.autoUploadAttachments,
      ),
      mediaCompression: normalizeOption(
        dataControls.mediaCompression,
        MEDIA_COMPRESSION_OPTIONS,
        fallback.dataControls.mediaCompression,
      ),
    },
    system: {
      language: normalizeOption(system.language, APP_LANGUAGE_OPTIONS, fallback.system.language),
      region: normalizeOption(system.region, REGION_OPTIONS, fallback.system.region),
      dataSaver: normalizeBoolean(system.dataSaver, fallback.system.dataSaver),
      batteryMode: normalizeOption(
        system.batteryMode,
        BATTERY_OPTIONS,
        fallback.system.batteryMode,
      ),
    },
    account: {
      fullName: normalizeString(account.fullName, fallback.account.fullName),
      displayName: normalizeString(account.displayName, fallback.account.displayName),
      email: normalizeString(account.email, fallback.account.email),
      phone: normalizeString(account.phone, fallback.account.phone),
      photoUri: normalizeString(account.photoUri, fallback.account.photoUri),
      photoHint: normalizeString(account.photoHint, fallback.account.photoHint),
    },
    attachments: {
      enabled: normalizeBoolean(attachments.enabled, fallback.attachments.enabled),
    },
    security: {
      microphonePermission: normalizeBoolean(
        security.microphonePermission,
        fallback.security.microphonePermission,
      ),
      cameraPermission: normalizeBoolean(
        security.cameraPermission,
        fallback.security.cameraPermission,
      ),
      filesPermission: normalizeBoolean(
        security.filesPermission,
        fallback.security.filesPermission,
      ),
      notificationsPermission: normalizeBoolean(
        security.notificationsPermission,
        fallback.security.notificationsPermission,
      ),
      biometricsPermission: normalizeBoolean(
        security.biometricsPermission,
        fallback.security.biometricsPermission,
      ),
      deviceBiometricsEnabled: normalizeBoolean(
        security.deviceBiometricsEnabled,
        fallback.security.deviceBiometricsEnabled,
      ),
      requireAuthOnOpen: normalizeBoolean(
        security.requireAuthOnOpen,
        fallback.security.requireAuthOnOpen,
      ),
      hideInMultitask: normalizeBoolean(
        security.hideInMultitask,
        fallback.security.hideInMultitask,
      ),
      lockTimeout: normalizeOption(
        security.lockTimeout,
        LOCK_TIMEOUT_OPTIONS,
        fallback.security.lockTimeout,
      ),
    },
  };
}

function migrateLegacySettings(input: Record<string, unknown>): AppSettings {
  const defaults = createDefaultAppSettings();
  const soundPreset = normalizeOption(
    input.somNotificacao,
    NOTIFICATION_SOUND_OPTIONS,
    defaults.notifications.soundPreset,
  );
  const autoTranscribe = normalizeBoolean(input.entradaPorVoz, defaults.speech.autoTranscribe);
  const autoReadResponses = normalizeBoolean(input.respostaPorVoz, defaults.speech.autoReadResponses);

  return {
    appearance: {
      theme: normalizeOption(input.temaApp, THEME_OPTIONS, defaults.appearance.theme),
      density: normalizeOption(
        input.densidadeInterface,
        DENSITY_OPTIONS,
        defaults.appearance.density,
      ),
      fontScale: normalizeOption(input.tamanhoFonte, FONT_SIZE_OPTIONS, defaults.appearance.fontScale),
      accentColor: normalizeOption(input.corDestaque, ACCENT_OPTIONS, defaults.appearance.accentColor),
      animationsEnabled: normalizeBoolean(
        input.animacoesAtivas,
        defaults.appearance.animationsEnabled,
      ),
    },
    ai: {
      model: normalizeOption(input.modeloIa, AI_MODEL_OPTIONS, defaults.ai.model),
      responseStyle: normalizeOption(
        input.estiloResposta,
        RESPONSE_STYLE_OPTIONS,
        defaults.ai.responseStyle,
      ),
      responseLanguage: normalizeOption(
        input.idiomaResposta,
        RESPONSE_LANGUAGE_OPTIONS,
        defaults.ai.responseLanguage,
      ),
      memoryEnabled: normalizeBoolean(input.memoriaIa, defaults.ai.memoryEnabled),
      learningOptIn: normalizeBoolean(input.aprendizadoIa, defaults.ai.learningOptIn),
      tone: normalizeOption(input.tomConversa, CONVERSATION_TONE_OPTIONS, defaults.ai.tone),
      temperature: normalizeTemperature(input.temperaturaIa, defaults.ai.temperature),
    },
    notifications: {
      pushEnabled: normalizeBoolean(input.notificaPush, defaults.notifications.pushEnabled),
      responseAlertsEnabled: normalizeBoolean(
        input.notificaRespostas,
        defaults.notifications.responseAlertsEnabled,
      ),
      soundEnabled: soundPreset !== "Silencioso",
      vibrationEnabled: normalizeBoolean(input.vibracaoAtiva, defaults.notifications.vibrationEnabled),
      emailEnabled: normalizeBoolean(input.emailsAtivos, defaults.notifications.emailEnabled),
      soundPreset,
      showMessageContent: normalizeBoolean(
        input.mostrarConteudoNotificacao,
        defaults.notifications.showMessageContent,
      ),
      hideContentOnLockScreen: normalizeBoolean(
        input.ocultarConteudoBloqueado,
        defaults.notifications.hideContentOnLockScreen,
      ),
      onlyShowNewMessage: normalizeBoolean(
        input.mostrarSomenteNovaMensagem,
        defaults.notifications.onlyShowNewMessage,
      ),
      chatCategoryEnabled: defaults.notifications.chatCategoryEnabled,
      mesaCategoryEnabled: defaults.notifications.mesaCategoryEnabled,
      systemCategoryEnabled: defaults.notifications.systemCategoryEnabled,
      criticalAlertsEnabled: defaults.notifications.criticalAlertsEnabled,
    },
    speech: {
      enabled: autoTranscribe || autoReadResponses,
      autoTranscribe,
      autoReadResponses,
      voiceLanguage: defaults.speech.voiceLanguage,
      speechRate: defaults.speech.speechRate,
      voiceId: defaults.speech.voiceId,
    },
    dataControls: {
      analyticsOptIn: normalizeBoolean(
        input.analyticsOptIn,
        defaults.dataControls.analyticsOptIn,
      ),
      crashReportsOptIn: normalizeBoolean(
        input.crashReportsOptIn,
        defaults.dataControls.crashReportsOptIn,
      ),
      wifiOnlySync: normalizeBoolean(input.wifiOnlySync, defaults.dataControls.wifiOnlySync),
      chatHistoryEnabled: normalizeBoolean(
        input.salvarHistoricoConversas,
        defaults.dataControls.chatHistoryEnabled,
      ),
      deviceBackupEnabled: normalizeBoolean(
        input.backupAutomatico,
        defaults.dataControls.deviceBackupEnabled,
      ),
      crossDeviceSyncEnabled: normalizeBoolean(
        input.sincronizacaoDispositivos,
        defaults.dataControls.crossDeviceSyncEnabled,
      ),
      retention: normalizeOption(
        input.retencaoDados,
        DATA_RETENTION_OPTIONS,
        defaults.dataControls.retention,
      ),
      autoUploadAttachments: defaults.dataControls.autoUploadAttachments,
      mediaCompression: defaults.dataControls.mediaCompression,
    },
    system: {
      language: normalizeOption(input.idiomaApp, APP_LANGUAGE_OPTIONS, defaults.system.language),
      region: normalizeOption(input.regiaoApp, REGION_OPTIONS, defaults.system.region),
      dataSaver: normalizeBoolean(input.economiaDados, defaults.system.dataSaver),
      batteryMode: normalizeOption(input.usoBateria, BATTERY_OPTIONS, defaults.system.batteryMode),
    },
    account: {
      fullName: normalizeString(input.perfilNome),
      displayName: normalizeString(input.perfilExibicao),
      email: normalizeString(input.emailAtualConta),
      phone: normalizeString(input.accountPhone),
      photoUri: normalizeString(input.perfilFotoUri),
      photoHint: normalizeString(input.perfilFotoHint, defaults.account.photoHint),
    },
    attachments: {
      enabled: normalizeBoolean(input.uploadArquivosAtivo, defaults.attachments.enabled),
    },
    security: {
      microphonePermission: normalizeBoolean(
        input.microfonePermitido,
        defaults.security.microphonePermission,
      ),
      cameraPermission: normalizeBoolean(
        input.cameraPermitida,
        defaults.security.cameraPermission,
      ),
      filesPermission: normalizeBoolean(
        input.arquivosPermitidos,
        defaults.security.filesPermission,
      ),
      notificationsPermission: normalizeBoolean(
        input.notificacoesPermitidas,
        defaults.security.notificationsPermission,
      ),
      biometricsPermission: normalizeBoolean(
        input.biometriaPermitida,
        defaults.security.biometricsPermission,
      ),
      deviceBiometricsEnabled: normalizeBoolean(
        input.deviceBiometricsEnabled,
        defaults.security.deviceBiometricsEnabled,
      ),
      requireAuthOnOpen: normalizeBoolean(
        input.requireAuthOnOpen,
        defaults.security.requireAuthOnOpen,
      ),
      hideInMultitask: normalizeBoolean(
        input.hideInMultitask,
        defaults.security.hideInMultitask,
      ),
      lockTimeout: normalizeOption(
        input.lockTimeout,
        LOCK_TIMEOUT_OPTIONS,
        defaults.security.lockTimeout,
      ),
    },
  };
}

export function migrateSettingsDocument(raw: unknown): PersistedSettingsDocument {
  const baseDocument = createDefaultSettingsDocument();
  if (!isRecord(raw)) {
    return baseDocument;
  }

  if (raw.schemaVersion === SETTINGS_SCHEMA_VERSION) {
    return {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      updatedAt: normalizeString(raw.updatedAt, baseDocument.updatedAt),
      settings: normalizeSettings(raw.settings),
    };
  }

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    settings: migrateLegacySettings(raw),
  };
}
