import type { MobileUser } from "../../types/mobile";
import type { CriticalSettingsSnapshot } from "../../features/settings/criticalSettings";
import { hashSnapshotCritico } from "../../features/settings/criticalSettings";
import {
  DATA_RETENTION_OPTIONS,
  NOTIFICATION_SOUND_OPTIONS,
} from "../schema/options";
import type { AppSettings } from "../schema/types";

function firstName(fullName: string): string {
  return (
    String(fullName || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)[0] || ""
  );
}

export function mergeMobileUserIntoSettings(
  settings: AppSettings,
  user: MobileUser | null | undefined,
): AppSettings {
  if (!user) {
    return settings;
  }
  const fullName = String(user.nome_completo || "").trim();
  const email = String(user.email || "").trim();
  const phone = String(user.telefone || "").trim();
  const photoUri = String(user.foto_perfil_url || "").trim();

  return {
    ...settings,
    account: {
      ...settings.account,
      fullName: fullName || settings.account.fullName,
      displayName: settings.account.displayName || firstName(fullName),
      email: email || settings.account.email,
      phone: phone || settings.account.phone,
      photoUri: photoUri || settings.account.photoUri,
      photoHint: photoUri
        ? "Foto sincronizada com a conta"
        : settings.account.photoHint,
    },
  };
}

export function settingsToCriticalSnapshot(
  settings: AppSettings,
): CriticalSettingsSnapshot {
  return {
    notificacoes: {
      notificaRespostas: settings.notifications.responseAlertsEnabled,
      notificaPush: settings.notifications.pushEnabled,
      somNotificacao: settings.notifications.soundPreset,
      vibracaoAtiva: settings.notifications.vibrationEnabled,
      emailsAtivos: settings.notifications.emailEnabled,
    },
    privacidade: {
      mostrarConteudoNotificacao: settings.notifications.showMessageContent,
      ocultarConteudoBloqueado: settings.notifications.hideContentOnLockScreen,
      mostrarSomenteNovaMensagem: settings.notifications.onlyShowNewMessage,
      salvarHistoricoConversas: settings.dataControls.chatHistoryEnabled,
      compartilharMelhoriaIa: settings.ai.learningOptIn,
      retencaoDados: settings.dataControls.retention,
    },
    permissoes: {
      microfonePermitido: settings.security.microphonePermission,
      cameraPermitida: settings.security.cameraPermission,
      arquivosPermitidos: settings.security.filesPermission,
      notificacoesPermitidas: settings.security.notificationsPermission,
      biometriaPermitida: settings.security.biometricsPermission,
    },
    experienciaIa: {
      modeloIa: settings.ai.model,
    },
  };
}

export function mergeCriticalSnapshotIntoSettings(
  settings: AppSettings,
  snapshot: CriticalSettingsSnapshot,
): AppSettings {
  const soundPreset: AppSettings["notifications"]["soundPreset"] =
    NOTIFICATION_SOUND_OPTIONS.includes(
      snapshot.notificacoes.somNotificacao as any,
    )
      ? (snapshot.notificacoes
          .somNotificacao as AppSettings["notifications"]["soundPreset"])
      : settings.notifications.soundPreset;
  const retention: AppSettings["dataControls"]["retention"] =
    DATA_RETENTION_OPTIONS.includes(snapshot.privacidade.retencaoDados as any)
      ? (snapshot.privacidade
          .retencaoDados as AppSettings["dataControls"]["retention"])
      : settings.dataControls.retention;
  const soundEnabled = soundPreset !== "Silencioso";
  return {
    ...settings,
    ai: {
      ...settings.ai,
      model: snapshot.experienciaIa.modeloIa,
      learningOptIn: snapshot.privacidade.compartilharMelhoriaIa,
    },
    notifications: {
      ...settings.notifications,
      pushEnabled: snapshot.notificacoes.notificaPush,
      responseAlertsEnabled: snapshot.notificacoes.notificaRespostas,
      soundEnabled,
      vibrationEnabled: snapshot.notificacoes.vibracaoAtiva,
      emailEnabled: snapshot.notificacoes.emailsAtivos,
      soundPreset,
      showMessageContent: snapshot.privacidade.mostrarConteudoNotificacao,
      hideContentOnLockScreen: snapshot.privacidade.ocultarConteudoBloqueado,
      onlyShowNewMessage: snapshot.privacidade.mostrarSomenteNovaMensagem,
    },
    dataControls: {
      ...settings.dataControls,
      chatHistoryEnabled: snapshot.privacidade.salvarHistoricoConversas,
      retention,
    },
    security: {
      ...settings.security,
      microphonePermission: snapshot.permissoes.microfonePermitido,
      cameraPermission: snapshot.permissoes.cameraPermitida,
      filesPermission: snapshot.permissoes.arquivosPermitidos,
      notificationsPermission: snapshot.permissoes.notificacoesPermitidas,
      biometricsPermission: snapshot.permissoes.biometriaPermitida,
    },
  };
}

export function buildCriticalSettingsHash(settings: AppSettings): string {
  return hashSnapshotCritico(settingsToCriticalSnapshot(settings));
}
