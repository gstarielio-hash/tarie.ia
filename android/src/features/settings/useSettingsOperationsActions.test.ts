import { act, renderHook } from "@testing-library/react-native";

import type { ConfirmSheetState } from "./settingsSheetTypes";
import type { ExternalIntegration } from "./useSettingsPresentation";
import { useSettingsOperationsActions } from "./useSettingsOperationsActions";

function criarBaseParams() {
  const integracoesExternas: ExternalIntegration[] = [
    {
      id: "google_drive",
      label: "Google Drive",
      description: "Desc",
      icon: "google",
      connected: false,
      lastSyncAt: "",
    },
  ];

  return {
    appRuntime: {
      versionLabel: "1.0.0",
      buildLabel: "100",
      updateStatusFallback: "Build atual.",
    },
    cacheLeituraVazio: {
      bootstrap: null,
      updatedAt: "",
    },
    canalSuporteUrl: "",
    emailAtualConta: "inspetor@tariel.test",
    eventosSeguranca: [],
    executarComReautenticacao: jest.fn((_: string, onSuccess: () => void) =>
      onSuccess(),
    ),
    fallbackEmail: "fallback@tariel.test",
    fecharConfiguracoes: jest.fn(),
    filaOfflineTotal: 2,
    filaSuporteLocal: [],
    formatarHorarioAtividade: jest.fn((value: string) => value),
    handleLogout: jest.fn(),
    integracaoSincronizandoId: "" as const,
    integracoesExternas,
    limpandoCache: false,
    microfonePermitido: true,
    cameraPermitida: true,
    arquivosPermitidos: true,
    notificacoesPermitidas: true,
    abrirConfirmacaoConfiguracao: jest.fn(),
    abrirSheetConfiguracao: jest.fn(),
    perfilExibicao: "Inspetor",
    perfilNome: "Inspetor Tariel",
    registrarEventoSegurancaLocal: jest.fn(),
    reautenticacaoExpiraEm: "",
    reautenticacaoAindaValida: jest.fn().mockReturnValue(true),
    abrirFluxoReautenticacao: jest.fn(),
    resumoAtualizacaoApp: "Sem atualização",
    sessaoAtualTitulo: "Pixel",
    setBugAttachmentDraft: jest.fn(),
    setCacheLeitura: jest.fn(),
    setFilaSuporteLocal: jest.fn(),
    setIntegracaoSincronizandoId: jest.fn(),
    setIntegracoesExternas: jest.fn(),
    setLimpandoCache: jest.fn(),
    setSettingsSheetNotice: jest.fn(),
    setStatusApi: jest.fn(),
    setStatusAtualizacaoApp: jest.fn(),
    setUltimaLimpezaCacheEm: jest.fn(),
    setUltimaVerificacaoAtualizacao: jest.fn(),
    setVerificandoAtualizacoes: jest.fn(),
    settingsSheetNotice: "",
    compartilharTextoExportado: jest.fn().mockResolvedValue(true),
    statusApi: "online" as const,
    statusAtualizacaoApp: "Sem atualização",
    tentarAbrirUrlExterna: jest.fn().mockResolvedValue(true),
    ultimaVerificacaoAtualizacao: "",
    verificandoAtualizacoes: false,
    showAlert: jest.fn(),
    onNotificarSistema: jest.fn(),
    montarScreenshotAnexo: jest.fn(),
  };
}

describe("useSettingsOperationsActions", () => {
  it("abre confirmacao para solicitar logout e executa onConfirm", () => {
    const base = criarBaseParams();

    const { result } = renderHook(() => useSettingsOperationsActions(base));

    act(() => {
      result.current.handleSolicitarLogout();
    });

    const config = base.abrirConfirmacaoConfiguracao.mock.calls[0]?.[0] as
      | ConfirmSheetState
      | undefined;

    expect(config?.title).toBe("Sair da conta");

    act(() => {
      config?.onConfirm?.();
    });

    expect(base.fecharConfiguracoes).toHaveBeenCalled();
    expect(base.handleLogout).toHaveBeenCalled();
  });

  it("executa reautenticacao antes de abrir confirmacoes criticas", () => {
    const base = criarBaseParams();

    const { result } = renderHook(() => useSettingsOperationsActions(base));

    act(() => {
      result.current.handleApagarHistoricoConfiguracoes();
      result.current.handleLimparTodasConversasConfig();
    });

    expect(base.executarComReautenticacao).toHaveBeenCalledTimes(2);
    expect(base.abrirConfirmacaoConfiguracao).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: "clearHistory",
      }),
    );
    expect(base.abrirConfirmacaoConfiguracao).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: "clearConversations",
      }),
    );
  });

  it("alterna integracao externa e atualiza aviso local", () => {
    const base = criarBaseParams();

    const { result } = renderHook(() => useSettingsOperationsActions(base));

    act(() => {
      result.current.handleAlternarIntegracaoExterna(
        base.integracoesExternas[0],
      );
    });

    expect(base.setIntegracoesExternas).toHaveBeenCalledTimes(1);
    const updater = base.setIntegracoesExternas.mock.calls[0]?.[0] as (
      current: typeof base.integracoesExternas,
    ) => typeof base.integracoesExternas;
    const atualizado = updater(base.integracoesExternas);
    expect(atualizado[0]?.connected).toBe(true);
    expect(base.registrarEventoSegurancaLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Google Drive conectada",
      }),
    );
    expect(base.setSettingsSheetNotice).toHaveBeenCalledWith(
      "Google Drive conectada com sucesso.",
    );
  });

  it("limpa a fila local de suporte via confirmacao", () => {
    const base = criarBaseParams();

    const { result } = renderHook(() => useSettingsOperationsActions(base));

    act(() => {
      result.current.handleLimparFilaSuporteLocal();
    });

    const config = base.abrirConfirmacaoConfiguracao.mock.calls[0]?.[0] as
      | ConfirmSheetState
      | undefined;
    expect(config?.confirmLabel).toBe("Limpar fila");

    act(() => {
      config?.onConfirm?.();
    });

    expect(base.setFilaSuporteLocal).toHaveBeenCalledWith([]);
    expect(base.registrarEventoSegurancaLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Fila local de suporte limpa",
      }),
    );
  });
});
