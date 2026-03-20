import type { SessionModalsStackProps } from "./SessionModalsStack";
import type { InspectorSessionModalsInput } from "./inspectorUiBuilderTypes";

type InspectorSessionModalStateInput = Pick<
  InspectorSessionModalsInput,
  | "anexosAberto"
  | "bloqueioAppAtivo"
  | "centralAtividadeAberta"
  | "confirmSheet"
  | "confirmTextDraft"
  | "detalheStatusPendenciaOffline"
  | "deviceBiometricsEnabled"
  | "filaOfflineAberta"
  | "filaOfflineFiltrada"
  | "filaOfflineOrdenada"
  | "filtroFilaOffline"
  | "filtrosFilaOffline"
  | "formatarHorarioAtividade"
  | "iconePendenciaOffline"
  | "legendaPendenciaOffline"
  | "monitorandoAtividade"
  | "notificacoes"
  | "pendenciaFilaProntaParaReenvio"
  | "podeSincronizarFilaOffline"
  | "previewAnexoImagem"
  | "renderSettingsSheetBody"
  | "resumoFilaOfflineFiltrada"
  | "resumoPendenciaOffline"
  | "rotuloStatusPendenciaOffline"
  | "session"
  | "settingsSheet"
  | "settingsSheetLoading"
  | "settingsSheetNotice"
  | "sincronizacaoDispositivos"
  | "sincronizandoFilaOffline"
  | "sincronizandoItemFilaId"
  | "statusApi"
>;

type InspectorSessionModalCallbacksInput = Pick<
  InspectorSessionModalsInput,
  | "fecharConfirmacaoConfiguracao"
  | "fecharSheetConfiguracao"
  | "handleAbrirNotificacao"
  | "handleConfirmarAcaoCritica"
  | "handleConfirmarSettingsSheet"
  | "handleDesbloquearAplicativo"
  | "handleEscolherAnexo"
  | "handleLogout"
  | "handleRetomarItemFilaOffline"
  | "removerItemFilaOffline"
  | "session"
  | "setAnexosAberto"
  | "setCentralAtividadeAberta"
  | "setConfirmTextDraft"
  | "setFilaOfflineAberta"
  | "setFiltroFilaOffline"
  | "setPreviewAnexoImagem"
  | "sincronizarFilaOffline"
  | "sincronizarItemFilaOffline"
>;

export function buildInspectorSessionModalState(
  input: InspectorSessionModalStateInput,
): Omit<
  SessionModalsStackProps,
  | "onAbrirNotificacao"
  | "onAppLockLogout"
  | "onAppLockUnlock"
  | "onChooseAttachment"
  | "onCloseActivityCenter"
  | "onCloseAttachmentPicker"
  | "onCloseAttachmentPreview"
  | "onCloseOfflineQueue"
  | "onCloseSettingsConfirmation"
  | "onCloseSettingsSheet"
  | "onConfirmSettingsConfirmation"
  | "onConfirmSettingsSheet"
  | "onConfirmTextChange"
  | "onRemoverItemFilaOffline"
  | "onRetomarItemFilaOffline"
  | "onSetFiltroFilaOffline"
  | "onSincronizarFilaOffline"
  | "onSincronizarItemFilaOffline"
> {
  const {
    anexosAberto,
    bloqueioAppAtivo,
    centralAtividadeAberta,
    confirmSheet,
    confirmTextDraft,
    detalheStatusPendenciaOffline,
    deviceBiometricsEnabled,
    filaOfflineAberta,
    filaOfflineFiltrada,
    filaOfflineOrdenada,
    filtroFilaOffline,
    filtrosFilaOffline,
    formatarHorarioAtividade,
    iconePendenciaOffline,
    legendaPendenciaOffline,
    monitorandoAtividade,
    notificacoes,
    pendenciaFilaProntaParaReenvio,
    podeSincronizarFilaOffline,
    previewAnexoImagem,
    renderSettingsSheetBody,
    resumoFilaOfflineFiltrada,
    resumoPendenciaOffline,
    rotuloStatusPendenciaOffline,
    session,
    settingsSheet,
    settingsSheetLoading,
    settingsSheetNotice,
    sincronizacaoDispositivos,
    sincronizandoFilaOffline,
    sincronizandoItemFilaId,
    statusApi,
  } = input;

  return {
    activityCenterVisible: centralAtividadeAberta,
    appLockVisible: bloqueioAppAtivo && Boolean(session),
    attachmentPickerVisible: anexosAberto,
    attachmentPreviewAccessToken: session?.accessToken || "",
    attachmentPreviewTitle: previewAnexoImagem?.titulo || "Imagem anexada",
    attachmentPreviewUri: previewAnexoImagem?.uri || "",
    attachmentPreviewVisible: Boolean(previewAnexoImagem),
    confirmSheet,
    confirmTextDraft,
    detalheStatusPendenciaOffline,
    deviceBiometricsEnabled,
    filaOfflineFiltrada,
    filaOfflineOrdenadaTotal: filaOfflineOrdenada.length,
    filtroFilaOffline,
    filtrosFilaOffline,
    formatarHorarioAtividade,
    iconePendenciaOffline,
    legendaPendenciaOffline,
    monitorandoAtividade,
    notificacoes,
    offlineQueueVisible: filaOfflineAberta,
    pendenciaFilaProntaParaReenvio,
    podeSincronizarFilaOffline,
    renderSettingsSheetBody,
    resumoFilaOfflineFiltrada,
    resumoPendenciaOffline,
    rotuloStatusPendenciaOffline,
    settingsConfirmationVisible: Boolean(confirmSheet),
    settingsSheet,
    settingsSheetLoading,
    settingsSheetNotice,
    settingsSheetVisible: Boolean(settingsSheet),
    sincronizandoFilaOffline,
    sincronizandoItemFilaId,
    sincronizacaoDispositivos,
    statusApi,
  };
}

export function buildInspectorSessionModalCallbacks(
  input: InspectorSessionModalCallbacksInput,
): Pick<
  SessionModalsStackProps,
  | "onAbrirNotificacao"
  | "onAppLockLogout"
  | "onAppLockUnlock"
  | "onChooseAttachment"
  | "onCloseActivityCenter"
  | "onCloseAttachmentPicker"
  | "onCloseAttachmentPreview"
  | "onCloseOfflineQueue"
  | "onCloseSettingsConfirmation"
  | "onCloseSettingsSheet"
  | "onConfirmSettingsConfirmation"
  | "onConfirmSettingsSheet"
  | "onConfirmTextChange"
  | "onRemoverItemFilaOffline"
  | "onRetomarItemFilaOffline"
  | "onSetFiltroFilaOffline"
  | "onSincronizarFilaOffline"
  | "onSincronizarItemFilaOffline"
> {
  const {
    fecharConfirmacaoConfiguracao,
    fecharSheetConfiguracao,
    handleAbrirNotificacao,
    handleConfirmarAcaoCritica,
    handleConfirmarSettingsSheet,
    handleDesbloquearAplicativo,
    handleEscolherAnexo,
    handleLogout,
    handleRetomarItemFilaOffline,
    removerItemFilaOffline,
    session,
    setAnexosAberto,
    setCentralAtividadeAberta,
    setConfirmTextDraft,
    setFilaOfflineAberta,
    setFiltroFilaOffline,
    setPreviewAnexoImagem,
    sincronizarFilaOffline,
    sincronizarItemFilaOffline,
  } = input;

  return {
    onAbrirNotificacao: (item) => {
      void handleAbrirNotificacao(item);
    },
    onAppLockLogout: handleLogout,
    onAppLockUnlock: handleDesbloquearAplicativo,
    onChooseAttachment: (option: "camera" | "galeria" | "documento") => {
      void handleEscolherAnexo(option);
    },
    onCloseActivityCenter: () => setCentralAtividadeAberta(false),
    onCloseAttachmentPicker: () => setAnexosAberto(false),
    onCloseAttachmentPreview: () => setPreviewAnexoImagem(null),
    onCloseOfflineQueue: () => setFilaOfflineAberta(false),
    onCloseSettingsConfirmation: fecharConfirmacaoConfiguracao,
    onCloseSettingsSheet: fecharSheetConfiguracao,
    onConfirmSettingsConfirmation: handleConfirmarAcaoCritica,
    onConfirmSettingsSheet: () => {
      void handleConfirmarSettingsSheet();
    },
    onConfirmTextChange: setConfirmTextDraft,
    onRemoverItemFilaOffline: removerItemFilaOffline,
    onRetomarItemFilaOffline: (item) => {
      void handleRetomarItemFilaOffline(item);
    },
    onSetFiltroFilaOffline: (key) => setFiltroFilaOffline(key),
    onSincronizarFilaOffline: () => {
      if (!session) {
        return;
      }
      void sincronizarFilaOffline(session.accessToken);
    },
    onSincronizarItemFilaOffline: (item) => {
      void sincronizarItemFilaOffline(item);
    },
  };
}
