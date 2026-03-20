import { act, renderHook } from "@testing-library/react-native";

import { useSettingsToggleActions } from "./useSettingsToggleActions";

jest.mock("../../config/observability", () => ({
  registrarEventoObservabilidade: jest.fn(),
}));

jest.mock("../chat/voice", () => ({
  stopSpeechPlayback: jest.fn(),
}));

jest.mock("../system/permissions", () => ({
  requestDevicePermission: jest.fn(),
}));

import { requestDevicePermission } from "../system/permissions";

function criarBaseParams() {
  return {
    arquivosPermitidos: true,
    cacheLeituraVazio: {
      bootstrap: null,
      updatedAt: "",
    },
    cameraPermitida: false,
    executarComReautenticacao: jest.fn((_: string, onSuccess: () => void) =>
      onSuccess(),
    ),
    filaOffline: [],
    microfonePermitido: true,
    notificacoesPermitidas: false,
    sessionAccessToken: "token-123",
    statusApi: "online" as const,
    abrirConfirmacaoConfiguracao: jest.fn(),
    handleExportarDados: jest.fn().mockResolvedValue(undefined),
    onIsOfflineItemReadyForRetry: jest.fn().mockReturnValue(false),
    onOpenSystemSettings: jest.fn(),
    onSaveReadCacheLocally: jest.fn().mockResolvedValue(undefined),
    onSetSettingsSheetNotice: jest.fn(),
    onSyncOfflineQueue: jest.fn().mockResolvedValue(undefined),
    registrarEventoSegurancaLocal: jest.fn(),
    setAnexoMesaRascunho: jest.fn(),
    setAnexoRascunho: jest.fn(),
    setArquivosPermitidos: jest.fn(),
    setBackupAutomatico: jest.fn(),
    setEntradaPorVoz: jest.fn(),
    setMicrofonePermitido: jest.fn(),
    setMostrarConteudoNotificacao: jest.fn(),
    setMostrarSomenteNovaMensagem: jest.fn(),
    setNotificaPush: jest.fn(),
    setNotificacoesPermitidas: jest.fn(),
    setOcultarConteudoBloqueado: jest.fn(),
    setRespostaPorVoz: jest.fn(),
    setSpeechEnabled: jest.fn(),
    setSincronizacaoDispositivos: jest.fn(),
    setUploadArquivosAtivo: jest.fn(),
    setVibracaoAtiva: jest.fn(),
    voiceInputRuntimeSupported: true,
    voiceInputUnavailableMessage: "Use o teclado por voz do sistema.",
    showAlert: jest.fn(),
  };
}

describe("useSettingsToggleActions", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("limpa o cache local ao desativar backup automatico", () => {
    const base = criarBaseParams();

    const { result } = renderHook(() => useSettingsToggleActions(base));

    act(() => {
      result.current.handleToggleBackupAutomatico(false);
    });

    expect(base.setBackupAutomatico).toHaveBeenCalledWith(false);
    expect(base.onSaveReadCacheLocally).toHaveBeenCalledWith(
      base.cacheLeituraVazio,
    );
    expect(base.registrarEventoSegurancaLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Backup automático desativado",
      }),
    );
  });

  it("forca o modo privado ao mostrar somente nova mensagem", () => {
    const base = criarBaseParams();

    const { result } = renderHook(() => useSettingsToggleActions(base));

    act(() => {
      result.current.handleToggleMostrarSomenteNovaMensagem(true);
    });

    expect(base.setMostrarSomenteNovaMensagem).toHaveBeenCalledWith(true);
    expect(base.setMostrarConteudoNotificacao).toHaveBeenCalledWith(false);
    expect(base.setOcultarConteudoBloqueado).toHaveBeenCalledWith(true);
  });

  it("abre ajustes do sistema ao revisar permissoes criticas", () => {
    const base = {
      ...criarBaseParams(),
      arquivosPermitidos: false,
      cameraPermitida: false,
      notificacoesPermitidas: true,
    };

    const { result } = renderHook(() => useSettingsToggleActions(base));

    act(() => {
      result.current.handleRevisarPermissoesCriticas();
    });

    const config = base.abrirConfirmacaoConfiguracao.mock.calls[0]?.[0];
    expect(config?.title).toBe("Revisar permissões críticas");

    act(() => {
      config?.onConfirm?.();
    });

    expect(base.registrarEventoSegurancaLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Revisão de permissões críticas",
        meta: "Pendentes: câmera, arquivos",
      }),
    );
    expect(base.onOpenSystemSettings).toHaveBeenCalledTimes(1);
  });

  it("reautentica antes de exportar dados para exclusao da conta", () => {
    const base = criarBaseParams();

    const { result } = renderHook(() => useSettingsToggleActions(base));

    act(() => {
      result.current.handleExportarAntesDeExcluirConta();
    });

    expect(base.executarComReautenticacao).toHaveBeenCalledWith(
      "Confirme sua identidade para exportar os dados antes da exclusão permanente da conta.",
      expect.any(Function),
    );
    expect(base.handleExportarDados).toHaveBeenCalledWith("JSON");
  });

  it("avisa quando a entrada por voz depende de STT indisponivel", async () => {
    const base = {
      ...criarBaseParams(),
      microfonePermitido: false,
      voiceInputRuntimeSupported: false,
    };

    (requestDevicePermission as jest.Mock).mockResolvedValue(true);

    const { result } = renderHook(() => useSettingsToggleActions(base));

    await act(async () => {
      await result.current.handleToggleEntradaPorVoz(true);
    });

    expect(requestDevicePermission).toHaveBeenCalledWith("microphone");
    expect(base.setMicrofonePermitido).toHaveBeenCalledWith(true);
    expect(base.setEntradaPorVoz).toHaveBeenCalledWith(true);
    expect(base.onSetSettingsSheetNotice).toHaveBeenCalledWith(
      "Use o teclado por voz do sistema.",
    );
  });
});
