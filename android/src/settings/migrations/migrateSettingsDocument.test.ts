import { migrateSettingsDocument } from "./migrateSettingsDocument";

describe("migrateSettingsDocument", () => {
  it("migrates legacy app preferences into the current settings schema", () => {
    const migrated = migrateSettingsDocument({
      perfilNome: "Gabriel",
      perfilExibicao: "Gabi",
      emailAtualConta: "gabriel@tariel.ia",
      idiomaResposta: "Português",
      estiloResposta: "curto",
      modeloIa: "avançado",
      salvarHistoricoConversas: false,
      backupAutomatico: false,
      sincronizacaoDispositivos: false,
      entradaPorVoz: true,
      respostaPorVoz: false,
      notificaPush: true,
      crashReportsOptIn: true,
      analyticsOptIn: true,
      usoBateria: "Economia máxima",
    });

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.settings.account.fullName).toBe("Gabriel");
    expect(migrated.settings.account.displayName).toBe("Gabi");
    expect(migrated.settings.ai.model).toBe("avançado");
    expect(migrated.settings.ai.responseStyle).toBe("curto");
    expect(migrated.settings.dataControls.chatHistoryEnabled).toBe(false);
    expect(migrated.settings.dataControls.deviceBackupEnabled).toBe(false);
    expect(migrated.settings.dataControls.crossDeviceSyncEnabled).toBe(false);
    expect(migrated.settings.speech.enabled).toBe(true);
    expect(migrated.settings.speech.autoTranscribe).toBe(true);
    expect(migrated.settings.system.batteryMode).toBe("Otimizado");
  });

  it("normalizes an already-versioned document without trusting invalid values", () => {
    const migrated = migrateSettingsDocument({
      schemaVersion: 2,
      updatedAt: "2026-03-20T00:00:00.000Z",
      settings: {
        appearance: {
          theme: "tema-invalido",
          density: "compacto",
          fontScale: "médio",
          accentColor: "laranja",
          animationsEnabled: true,
        },
        ai: {
          model: "equilibrado",
          responseStyle: "padrão",
          responseLanguage: "Português",
          memoryEnabled: true,
          learningOptIn: false,
          tone: "profissional",
          temperature: 10,
        },
        notifications: {
          pushEnabled: true,
          responseAlertsEnabled: true,
          soundEnabled: true,
          vibrationEnabled: true,
          emailEnabled: false,
          soundPreset: "Som inválido",
          showMessageContent: true,
          hideContentOnLockScreen: false,
          onlyShowNewMessage: false,
          chatCategoryEnabled: true,
          mesaCategoryEnabled: true,
          systemCategoryEnabled: true,
          criticalAlertsEnabled: true,
        },
        speech: {
          enabled: true,
          autoTranscribe: true,
          autoReadResponses: true,
          voiceLanguage: "Idioma inválido",
          speechRate: 3,
          voiceId: 42,
        },
        dataControls: {
          analyticsOptIn: true,
          crashReportsOptIn: true,
          wifiOnlySync: false,
          chatHistoryEnabled: true,
          deviceBackupEnabled: true,
          crossDeviceSyncEnabled: true,
          retention: "30 dias",
          autoUploadAttachments: true,
          mediaCompression: "alta",
        },
        system: {
          language: "Idioma inválido",
          region: "Brasil",
          dataSaver: false,
          batteryMode: "Otimizado",
        },
        account: {
          fullName: "Gabriel",
          displayName: "Tariel",
          email: "gabriel@tariel.ia",
          phone: "11999999999",
          photoUri: "",
          photoHint: "Atualize",
        },
        attachments: {
          enabled: true,
        },
        security: {
          microphonePermission: true,
          cameraPermission: true,
          filesPermission: true,
          notificationsPermission: true,
          biometricsPermission: false,
          deviceBiometricsEnabled: false,
          requireAuthOnOpen: false,
          hideInMultitask: false,
          lockTimeout: "15 min",
        },
      },
    });

    expect(migrated.updatedAt).toBe("2026-03-20T00:00:00.000Z");
    expect(migrated.settings.appearance.theme).toBe("claro");
    expect(migrated.settings.notifications.soundPreset).toBe("Ping");
    expect(migrated.settings.speech.voiceLanguage).toBe("Sistema");
    expect(migrated.settings.speech.speechRate).toBe(1.5);
    expect(migrated.settings.ai.temperature).toBe(1);
    expect(migrated.settings.system.language).toBe("Português");
  });
});
