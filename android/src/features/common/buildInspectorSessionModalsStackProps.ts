import { buildSessionModalsStackProps } from "./buildSessionModalsStackProps";

type BuildInspectorSessionModalsStackPropsInput = Record<string, any>;

export function buildInspectorSessionModalsStackProps(
  input: BuildInspectorSessionModalsStackPropsInput,
): ReturnType<typeof buildSessionModalsStackProps> {
  const {
    anexosAberto,
    bloqueioAppAtivo,
    centralAtividadeAberta,
    confirmSheet,
    confirmTextDraft,
    detalheStatusPendenciaOffline,
    deviceBiometricsEnabled,
    fecharConfirmacaoConfiguracao,
    fecharSheetConfiguracao,
    filaOfflineAberta,
    filaOfflineFiltrada,
    filaOfflineOrdenada,
    filtroFilaOffline,
    filtrosFilaOffline,
    formatarHorarioAtividade,
    handleAbrirNotificacao,
    handleConfirmarAcaoCritica,
    handleConfirmarSettingsSheet,
    handleDesbloquearAplicativo,
    handleEscolherAnexo,
    handleLogout,
    handleRetomarItemFilaOffline,
    iconePendenciaOffline,
    legendaPendenciaOffline,
    monitorandoAtividade,
    notificacoes,
    pendenciaFilaProntaParaReenvio,
    podeSincronizarFilaOffline,
    previewAnexoImagem,
    removerItemFilaOffline,
    renderSettingsSheetBody,
    resumoFilaOfflineFiltrada,
    resumoPendenciaOffline,
    rotuloStatusPendenciaOffline,
    session,
    setAnexosAberto,
    setCentralAtividadeAberta,
    setConfirmTextDraft,
    setFilaOfflineAberta,
    setFiltroFilaOffline,
    setPreviewAnexoImagem,
    settingsSheet,
    settingsSheetLoading,
    settingsSheetNotice,
    sincronizacaoDispositivos,
    sincronizarFilaOffline,
    sincronizarItemFilaOffline,
    sincronizandoFilaOffline,
    sincronizandoItemFilaId,
    statusApi,
  } = input;

  return buildSessionModalsStackProps({
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
    onAbrirNotificacao: (item: any) => {
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
    onRetomarItemFilaOffline: (item: any) => {
      void handleRetomarItemFilaOffline(item);
    },
    onSetFiltroFilaOffline: (key: string) => setFiltroFilaOffline(key as any),
    onSincronizarFilaOffline: () => {
      if (!session) {
        return;
      }
      void sincronizarFilaOffline(session.accessToken);
    },
    onSincronizarItemFilaOffline: (item: any) => {
      void sincronizarItemFilaOffline(item);
    },
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
  });
}
