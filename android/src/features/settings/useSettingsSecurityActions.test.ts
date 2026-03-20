import { act, renderHook } from "@testing-library/react-native";

import type { ConfirmSheetState } from "./settingsSheetTypes";
import { useSettingsSecurityActions } from "./useSettingsSecurityActions";

function criarBaseParams(
  overrides: Partial<Parameters<typeof useSettingsSecurityActions>[0]> = {},
): Parameters<typeof useSettingsSecurityActions>[0] {
  return {
    biometriaLocalSuportada: false,
    biometriaPermitida: false,
    codigosRecuperacao: [],
    codigo2FA: "",
    emailAtualConta: "inspetor@tariel.test",
    fallbackEmail: "fallback@tariel.test",
    fecharConfiguracoes: jest.fn(),
    handleLogout: jest.fn(),
    provedoresConectados: [
      {
        id: "google",
        label: "Google",
        email: "inspetor@tariel.test",
        connected: true,
        requiresReauth: true,
      },
      {
        id: "apple",
        label: "Apple",
        email: "",
        connected: false,
        requiresReauth: true,
      },
      {
        id: "microsoft",
        label: "Microsoft",
        email: "",
        connected: false,
        requiresReauth: true,
      },
    ],
    reautenticacaoExpiraEm: "",
    requireAuthOnOpen: false,
    sessoesAtivas: [
      {
        id: "current",
        title: "Pixel",
        meta: "Atual",
        location: "São Paulo, BR",
        lastSeen: "Agora",
        current: true,
      },
      {
        id: "suspect",
        title: "Chrome",
        meta: "Web",
        location: "Campinas, BR",
        lastSeen: "Ontem",
        current: false,
        suspicious: true,
      },
    ],
    twoFactorEnabled: false,
    twoFactorMethod: "App autenticador",
    abrirConfirmacaoConfiguracao: jest.fn(),
    abrirFluxoReautenticacao: jest.fn(),
    abrirSheetConfiguracao: jest.fn(),
    compartilharTextoExportado: jest.fn().mockResolvedValue(true),
    executarComReautenticacao: jest.fn((_: string, onSuccess: () => void) =>
      onSuccess(),
    ),
    openSystemSettings: jest.fn(),
    registrarEventoSegurancaLocal: jest.fn(),
    reautenticacaoAindaValida: jest.fn().mockReturnValue(true),
    setCodigo2FA: jest.fn(),
    setCodigosRecuperacao: jest.fn(),
    setDeviceBiometricsEnabled: jest.fn(),
    setProvedoresConectados: jest.fn(),
    setRequireAuthOnOpen: jest.fn(),
    setSessoesAtivas: jest.fn(),
    setSettingsSheetNotice: jest.fn(),
    setTwoFactorEnabled: jest.fn(),
    setTwoFactorMethod: jest.fn(),
    showAlert: jest.fn(),
    ...overrides,
  };
}

describe("useSettingsSecurityActions", () => {
  it("abre aviso quando todos os provedores ja estao conectados", () => {
    const abrirConfirmacaoConfiguracao = jest.fn();
    const { result } = renderHook(() =>
      useSettingsSecurityActions(
        criarBaseParams({
          abrirConfirmacaoConfiguracao,
          provedoresConectados: [
            {
              id: "google",
              label: "Google",
              email: "a@test",
              connected: true,
              requiresReauth: true,
            },
            {
              id: "apple",
              label: "Apple",
              email: "b@test",
              connected: true,
              requiresReauth: true,
            },
            {
              id: "microsoft",
              label: "Microsoft",
              email: "c@test",
              connected: true,
              requiresReauth: true,
            },
          ],
        }),
      ),
    );

    act(() => {
      result.current.handleConectarProximoProvedorDisponivel();
    });

    expect(abrirConfirmacaoConfiguracao).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "provider",
        title: "Todos os provedores já estão vinculados",
      }),
    );
  });

  it("atualiza o metodo de 2FA e registra o evento", () => {
    const setTwoFactorMethod = jest.fn();
    const registrarEventoSegurancaLocal = jest.fn();

    const { result } = renderHook(() =>
      useSettingsSecurityActions(
        criarBaseParams({
          twoFactorEnabled: true,
          setTwoFactorMethod,
          registrarEventoSegurancaLocal,
        }),
      ),
    );

    act(() => {
      result.current.handleMudarMetodo2FA("Email");
    });

    expect(setTwoFactorMethod).toHaveBeenCalledWith("Email");
    expect(registrarEventoSegurancaLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Método preferido de 2FA atualizado",
        critical: true,
      }),
    );
  });

  it("abre confirmacao de 2FA apos reautenticacao e aplica o toggle no confirm", () => {
    const abrirConfirmacaoConfiguracao = jest.fn();
    const setTwoFactorEnabled = jest.fn();
    const registrarEventoSegurancaLocal = jest.fn();

    const { result } = renderHook(() =>
      useSettingsSecurityActions(
        criarBaseParams({
          abrirConfirmacaoConfiguracao,
          setTwoFactorEnabled,
          registrarEventoSegurancaLocal,
          twoFactorMethod: "Email",
        }),
      ),
    );

    act(() => {
      result.current.handleToggle2FA();
    });

    const confirmConfig = abrirConfirmacaoConfiguracao.mock.calls[0]?.[0] as
      | ConfirmSheetState
      | undefined;

    expect(confirmConfig?.title).toBe("Ativar verificação em duas etapas");

    act(() => {
      confirmConfig?.onConfirm?.();
    });

    expect(setTwoFactorEnabled).toHaveBeenCalledWith(true);
    expect(registrarEventoSegurancaLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "2FA ativada",
        meta: "Método preferido: Email",
      }),
    );
  });

  it("valida o codigo 2FA antes de confirmar", () => {
    const showAlert = jest.fn();
    const registrarEventoSegurancaLocal = jest.fn();
    const setCodigo2FA = jest.fn();

    const { result: invalidResult } = renderHook(() =>
      useSettingsSecurityActions(
        criarBaseParams({
          codigo2FA: "123",
          showAlert,
          registrarEventoSegurancaLocal,
          setCodigo2FA,
        }),
      ),
    );

    act(() => {
      invalidResult.current.handleConfirmarCodigo2FA();
    });

    expect(showAlert).toHaveBeenCalledWith(
      "Código inválido",
      "Digite um código válido para concluir a configuração da verificação em duas etapas.",
    );
    expect(registrarEventoSegurancaLocal).not.toHaveBeenCalled();

    const { result: validResult } = renderHook(() =>
      useSettingsSecurityActions(
        criarBaseParams({
          codigo2FA: "123456",
          showAlert,
          registrarEventoSegurancaLocal,
          setCodigo2FA,
        }),
      ),
    );

    act(() => {
      validResult.current.handleConfirmarCodigo2FA();
    });

    expect(showAlert).toHaveBeenCalledWith(
      "Código confirmado",
      "A verificação em duas etapas foi confirmada no app.",
    );
    expect(registrarEventoSegurancaLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Código 2FA confirmado",
      }),
    );
    expect(setCodigo2FA).toHaveBeenCalledWith("");
  });
});
