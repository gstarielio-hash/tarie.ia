import {
  buildInspectorSessionModalCallbacks,
  buildInspectorSessionModalState,
} from "./buildInspectorSessionModalsSections";

describe("buildInspectorSessionModalsSections", () => {
  it("monta o estado visual dos modais com preview e lock do app", () => {
    const state = buildInspectorSessionModalState({
      anexosAberto: true,
      bloqueioAppAtivo: true,
      centralAtividadeAberta: true,
      confirmSheet: { kind: "logout" },
      confirmTextDraft: "CONFIRMAR",
      detalheStatusPendenciaOffline: "Backoff",
      deviceBiometricsEnabled: true,
      filaOfflineAberta: true,
      filaOfflineFiltrada: [{ id: "1" }],
      filaOfflineOrdenada: [{ id: "1" }, { id: "2" }],
      filtroFilaOffline: "all",
      filtrosFilaOffline: [{ key: "all", label: "Tudo", count: 2 }],
      formatarHorarioAtividade: jest.fn(),
      iconePendenciaOffline: jest.fn(),
      legendaPendenciaOffline: jest.fn(),
      monitorandoAtividade: true,
      notificacoes: [{ id: "n-1" }],
      pendenciaFilaProntaParaReenvio: jest.fn(),
      podeSincronizarFilaOffline: true,
      previewAnexoImagem: {
        titulo: "evidencia",
        uri: "file:///evidencia.png",
      },
      renderSettingsSheetBody: jest.fn(),
      resumoFilaOfflineFiltrada: "2 pendências",
      resumoPendenciaOffline: jest.fn(),
      rotuloStatusPendenciaOffline: jest.fn(),
      session: { accessToken: "token-123" },
      settingsSheet: { kind: "profile" },
      settingsSheetLoading: false,
      settingsSheetNotice: "",
      sincronizacaoDispositivos: true,
      sincronizandoFilaOffline: false,
      sincronizandoItemFilaId: null,
      statusApi: "online",
    });

    expect(state.appLockVisible).toBe(true);
    expect(state.activityCenterVisible).toBe(true);
    expect(state.attachmentPreviewAccessToken).toBe("token-123");
    expect(state.attachmentPreviewTitle).toBe("evidencia");
    expect(state.filaOfflineOrdenadaTotal).toBe(2);
    expect(state.settingsSheetVisible).toBe(true);
  });

  it("wiring dos callbacks usa o token da sessao ao sincronizar a fila", () => {
    const setFiltroFilaOffline = jest.fn();
    const sincronizarFilaOffline = jest.fn();

    const callbacks = buildInspectorSessionModalCallbacks({
      fecharConfirmacaoConfiguracao: jest.fn(),
      fecharSheetConfiguracao: jest.fn(),
      handleAbrirNotificacao: jest.fn(),
      handleConfirmarAcaoCritica: jest.fn(),
      handleConfirmarSettingsSheet: jest.fn(),
      handleDesbloquearAplicativo: jest.fn(),
      handleEscolherAnexo: jest.fn(),
      handleLogout: jest.fn(),
      handleRetomarItemFilaOffline: jest.fn(),
      removerItemFilaOffline: jest.fn(),
      session: { accessToken: "token-abc" },
      setAnexosAberto: jest.fn(),
      setCentralAtividadeAberta: jest.fn(),
      setConfirmTextDraft: jest.fn(),
      setFilaOfflineAberta: jest.fn(),
      setFiltroFilaOffline,
      setPreviewAnexoImagem: jest.fn(),
      sincronizarFilaOffline,
      sincronizarItemFilaOffline: jest.fn(),
    });

    callbacks.onSetFiltroFilaOffline("chat");
    callbacks.onSincronizarFilaOffline();

    expect(setFiltroFilaOffline).toHaveBeenCalledWith("chat");
    expect(sincronizarFilaOffline).toHaveBeenCalledWith("token-abc");
  });
});
