import { act, renderHook } from "@testing-library/react-native";

import {
  carregarBootstrapMobile,
  loginInspectorMobile,
  logoutInspectorMobile,
} from "../../config/api";
import type { MobileReadCache } from "../common/readCacheTypes";
import { EMAIL_KEY, TOKEN_KEY } from "../InspectorMobileApp.constants";
import { runBootstrapAppFlow } from "../bootstrap/runBootstrapAppFlow";
import { removeSecureItem, writeSecureItem } from "./sessionStorage";
import {
  useInspectorSession,
  type UseInspectorSessionParams,
} from "./useInspectorSession";

jest.mock("../../config/api", () => ({
  carregarBootstrapMobile: jest.fn(),
  loginInspectorMobile: jest.fn(),
  logoutInspectorMobile: jest.fn(),
  pingApi: jest.fn(),
}));

jest.mock("../bootstrap/runBootstrapAppFlow", () => ({
  runBootstrapAppFlow: jest.fn(),
}));

jest.mock("./sessionStorage", () => ({
  readSecureItem: jest.fn(),
  writeSecureItem: jest.fn(),
  removeSecureItem: jest.fn(),
}));

function criarBootstrap() {
  return {
    ok: true,
    app: {
      nome: "Tariel Inspetor",
      portal: "inspetor",
      api_base_url: "https://api.tariel.test",
      suporte_whatsapp: "",
    },
    usuario: {
      id: 7,
      nome_completo: "Inspetor Tariel",
      email: "inspetor@tariel.test",
      telefone: "(11) 99999-0000",
      foto_perfil_url: "",
      empresa_nome: "Tariel",
      empresa_id: 3,
      nivel_acesso: 5,
    },
  } as const;
}

function criarCacheLeituraVazio(): MobileReadCache {
  return {
    bootstrap: null,
    laudos: [],
    conversaAtual: null,
    conversasPorLaudo: {},
    mesaPorLaudo: {},
    chatDrafts: {},
    mesaDrafts: {},
    chatAttachmentDrafts: {},
    mesaAttachmentDrafts: {},
    updatedAt: "",
  };
}

function criarParams(
  overrides: Partial<UseInspectorSessionParams> = {},
): UseInspectorSessionParams {
  return {
    settingsHydrated: false,
    chatHistoryEnabled: true,
    deviceBackupEnabled: true,
    aplicarPreferenciasLaudos: jest.fn((items) => items),
    chaveCacheLaudo: jest.fn((laudoId) => `laudo:${laudoId ?? "rascunho"}`),
    erroSugereModoOffline: jest.fn().mockReturnValue(false),
    lerCacheLeituraLocal: jest.fn().mockResolvedValue(criarCacheLeituraVazio()),
    lerEstadoHistoricoLocal: jest.fn().mockResolvedValue({
      laudosFixadosIds: [],
      historicoOcultoIds: [],
    }),
    lerFilaOfflineLocal: jest.fn().mockResolvedValue([]),
    lerNotificacoesLocais: jest.fn().mockResolvedValue([]),
    limparCachePorPrivacidade: jest.fn((cache) => cache),
    cacheLeituraVazio: criarCacheLeituraVazio(),
    onSetFilaOffline: jest.fn(),
    onSetNotificacoes: jest.fn(),
    onSetCacheLeitura: jest.fn(),
    onSetLaudosFixadosIds: jest.fn(),
    onSetHistoricoOcultoIds: jest.fn(),
    onSetUsandoCacheOffline: jest.fn(),
    onSetLaudosDisponiveis: jest.fn(),
    onSetConversa: jest.fn(),
    onSetMensagensMesa: jest.fn(),
    onSetLaudoMesaCarregado: jest.fn(),
    onSetErroLaudos: jest.fn(),
    onApplyBootstrapCache: jest.fn(),
    onAfterLoginSuccess: jest.fn(),
    onResetAfterLogout: jest.fn(),
    ...overrides,
  };
}

describe("useInspectorSession", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("espera as configuracoes hidratarem antes de disparar o bootstrap", async () => {
    (runBootstrapAppFlow as jest.Mock).mockResolvedValue(undefined);

    const initialParams = criarParams({ settingsHydrated: false });
    const { rerender } = renderHook(
      ({ params }: { params: typeof initialParams }) =>
        useInspectorSession(params),
      {
        initialProps: {
          params: initialParams,
        },
      },
    );

    expect(runBootstrapAppFlow).not.toHaveBeenCalled();

    await act(async () => {
      rerender({
        params: {
          ...initialParams,
          settingsHydrated: true,
        },
      });
      await Promise.resolve();
    });

    expect(runBootstrapAppFlow).toHaveBeenCalledTimes(1);
  });

  it("faz login, persiste credenciais e abre a sessao local", async () => {
    const bootstrap = criarBootstrap();
    const onApplyBootstrapCache = jest.fn();
    const onAfterLoginSuccess = jest.fn();
    (loginInspectorMobile as jest.Mock).mockResolvedValue({
      access_token: "token-123",
    });
    (carregarBootstrapMobile as jest.Mock).mockResolvedValue(bootstrap);

    const { result } = renderHook(() =>
      useInspectorSession(
        criarParams({
          onApplyBootstrapCache,
          onAfterLoginSuccess,
        }),
      ),
    );

    act(() => {
      result.current.actions.setEmail("inspetor@tariel.test");
      result.current.actions.setSenha("segredo-forte");
    });

    await act(async () => {
      await result.current.actions.handleLogin();
    });

    expect(loginInspectorMobile).toHaveBeenCalledWith(
      "inspetor@tariel.test",
      "segredo-forte",
      true,
    );
    expect(carregarBootstrapMobile).toHaveBeenCalledWith("token-123");
    expect(writeSecureItem).toHaveBeenNthCalledWith(1, TOKEN_KEY, "token-123");
    expect(writeSecureItem).toHaveBeenNthCalledWith(
      2,
      EMAIL_KEY,
      "inspetor@tariel.test",
    );
    expect(onApplyBootstrapCache).toHaveBeenCalledWith(bootstrap);
    expect(onAfterLoginSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.state.senha).toBe("");
    expect(result.current.state.session).toEqual({
      accessToken: "token-123",
      bootstrap,
    });
  });

  it("faz logout limpando o token e resetando a sessao local", async () => {
    const onResetAfterLogout = jest.fn();
    const bootstrap = criarBootstrap();
    (logoutInspectorMobile as jest.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useInspectorSession(
        criarParams({
          onResetAfterLogout,
        }),
      ),
    );

    act(() => {
      result.current.actions.setSession({
        accessToken: "token-logout",
        bootstrap,
      });
    });

    await act(async () => {
      await result.current.actions.handleLogout();
    });

    expect(logoutInspectorMobile).toHaveBeenCalledWith("token-logout");
    expect(removeSecureItem).toHaveBeenCalledWith(TOKEN_KEY);
    expect(onResetAfterLogout).toHaveBeenCalledTimes(1);
    expect(result.current.state.session).toBeNull();
  });
});
