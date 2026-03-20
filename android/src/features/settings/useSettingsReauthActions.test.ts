import { act, renderHook } from "@testing-library/react-native";

import { useSettingsReauthActions } from "./useSettingsReauthActions";

describe("useSettingsReauthActions", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("executa a acao imediatamente quando a reautenticacao ainda esta valida", () => {
    const onSuccess = jest.fn();
    const abrirSheetConfiguracao = jest.fn();

    const { result } = renderHook(() =>
      useSettingsReauthActions({
        abrirConfirmacaoConfiguracao: jest.fn(),
        abrirSheetConfiguracao,
        fecharSheetConfiguracao: jest.fn(),
        notificarConfiguracaoConcluida: jest.fn(),
        registrarEventoSegurancaLocal: jest.fn(),
        reautenticacaoExpiraEm: "2099-01-01T00:00:00.000Z",
        settingsSheet: null,
        reautenticacaoAindaValida: jest.fn().mockReturnValue(true),
        setReauthReason: jest.fn(),
        setReautenticacaoExpiraEm: jest.fn(),
        setReautenticacaoStatus: jest.fn(),
        setSettingsSheetLoading: jest.fn(),
        setSettingsSheetNotice: jest.fn(),
      }),
    );

    act(() => {
      result.current.executarComReautenticacao("Confirmar", onSuccess);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(abrirSheetConfiguracao).not.toHaveBeenCalled();
  });

  it("abre a sheet de reautenticacao quando a sessao sensivel expirou", () => {
    const abrirSheetConfiguracao = jest.fn();
    const setReauthReason = jest.fn();

    const { result } = renderHook(() =>
      useSettingsReauthActions({
        abrirConfirmacaoConfiguracao: jest.fn(),
        abrirSheetConfiguracao,
        fecharSheetConfiguracao: jest.fn(),
        notificarConfiguracaoConcluida: jest.fn(),
        registrarEventoSegurancaLocal: jest.fn(),
        reautenticacaoExpiraEm: "",
        settingsSheet: null,
        reautenticacaoAindaValida: jest.fn().mockReturnValue(false),
        setReauthReason,
        setReautenticacaoExpiraEm: jest.fn(),
        setReautenticacaoStatus: jest.fn(),
        setSettingsSheetLoading: jest.fn(),
        setSettingsSheetNotice: jest.fn(),
      }),
    );

    act(() => {
      result.current.executarComReautenticacao("Confirmar email", jest.fn());
    });

    expect(setReauthReason).toHaveBeenCalledWith("Confirmar email");
    expect(abrirSheetConfiguracao).toHaveBeenCalledWith({
      kind: "reauth",
      title: "Confirmar identidade",
      subtitle:
        "Antes de continuar, valide a identidade do inspetor para proteger ações sensíveis.",
      actionLabel: "Confirmar agora",
    });
  });

  it("confirma a reautenticacao, fecha a sheet e libera a acao pendente", async () => {
    jest.useFakeTimers();
    const onSuccess = jest.fn();
    const fecharSheetConfiguracao = jest.fn();
    const setReautenticacaoExpiraEm = jest.fn();
    const setReautenticacaoStatus = jest.fn();
    const setSettingsSheetLoading = jest.fn();
    const setSettingsSheetNotice = jest.fn();
    const registrarEventoSegurancaLocal = jest.fn();

    const { result, rerender } = renderHook(
      ({
        settingsSheet,
      }: {
        settingsSheet: { kind: "reauth"; title: string; subtitle: string };
      }) =>
        useSettingsReauthActions({
          abrirConfirmacaoConfiguracao: jest.fn(),
          abrirSheetConfiguracao: jest.fn(),
          fecharSheetConfiguracao,
          notificarConfiguracaoConcluida: jest.fn(),
          registrarEventoSegurancaLocal,
          reautenticacaoExpiraEm: "",
          settingsSheet,
          reautenticacaoAindaValida: jest.fn().mockReturnValue(false),
          setReauthReason: jest.fn(),
          setReautenticacaoExpiraEm,
          setReautenticacaoStatus,
          setSettingsSheetLoading,
          setSettingsSheetNotice,
        }),
      {
        initialProps: {
          settingsSheet: {
            kind: "reauth",
            title: "Confirmar identidade",
            subtitle: "Proteja ações sensíveis.",
          },
        },
      },
    );

    act(() => {
      result.current.abrirFluxoReautenticacao("Confirmar agora", onSuccess);
    });

    rerender({
      settingsSheet: {
        kind: "reauth",
        title: "Confirmar identidade",
        subtitle: "Proteja ações sensíveis.",
      },
    });

    await act(async () => {
      const pending = result.current.handleConfirmarSettingsSheetReauth();
      jest.advanceTimersByTime(420);
      await pending;
    });

    expect(setReautenticacaoExpiraEm).toHaveBeenCalledTimes(1);
    expect(setReautenticacaoStatus).toHaveBeenCalledTimes(1);
    expect(registrarEventoSegurancaLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reautenticação concluída",
      }),
    );
    expect(setSettingsSheetNotice).toHaveBeenCalledWith(
      "Identidade confirmada. O fluxo protegido será liberado agora.",
    );

    act(() => {
      jest.advanceTimersByTime(180);
    });

    expect(fecharSheetConfiguracao).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(setSettingsSheetLoading).toHaveBeenCalledWith(true);
    expect(setSettingsSheetLoading).toHaveBeenCalledWith(false);
  });

  it("pede reautenticacao antes de abrir a confirmacao de exclusao da conta", () => {
    const abrirConfirmacaoConfiguracao = jest.fn();

    const { result } = renderHook(() =>
      useSettingsReauthActions({
        abrirConfirmacaoConfiguracao,
        abrirSheetConfiguracao: jest.fn(),
        fecharSheetConfiguracao: jest.fn(),
        notificarConfiguracaoConcluida: jest.fn(),
        registrarEventoSegurancaLocal: jest.fn(),
        reautenticacaoExpiraEm: "2099-01-01T00:00:00.000Z",
        settingsSheet: null,
        reautenticacaoAindaValida: jest.fn().mockReturnValue(true),
        setReauthReason: jest.fn(),
        setReautenticacaoExpiraEm: jest.fn(),
        setReautenticacaoStatus: jest.fn(),
        setSettingsSheetLoading: jest.fn(),
        setSettingsSheetNotice: jest.fn(),
      }),
    );

    act(() => {
      result.current.handleExcluirConta();
    });

    expect(abrirConfirmacaoConfiguracao).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "deleteAccount",
        title: "Excluir conta",
      }),
    );
  });
});
