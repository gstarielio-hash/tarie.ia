import { useEffect, useRef, useState } from "react";

import {
  carregarBootstrapMobile,
  loginInspectorMobile,
  logoutInspectorMobile,
  pingApi,
} from "../../config/api";
import type {
  MobileBootstrapResponse,
  MobileLaudoCard,
  MobileMesaMessage,
} from "../../types/mobile";
import { EMAIL_KEY, TOKEN_KEY } from "../InspectorMobileApp.constants";
import { runBootstrapAppFlow } from "../bootstrap/runBootstrapAppFlow";
import {
  removeSecureItem,
  readSecureItem,
  writeSecureItem,
} from "./sessionStorage";
import type { InspectorSessionState, MobileSessionState } from "./sessionTypes";

interface LocalHistoryUiStateSnapshot {
  laudosFixadosIds: number[];
  historicoOcultoIds: number[];
}

interface UseInspectorSessionParams<
  TFilaOffline,
  TNotificacao,
  TCacheLeitura,
  TConversa,
> {
  settingsHydrated: boolean;
  chatHistoryEnabled: boolean;
  deviceBackupEnabled: boolean;
  aplicarPreferenciasLaudos: (
    itens: MobileLaudoCard[],
    fixadosIds: number[],
    ocultosIds: number[],
  ) => MobileLaudoCard[];
  chaveCacheLaudo: (laudoId: number | null) => string;
  erroSugereModoOffline: (error: unknown) => boolean;
  lerCacheLeituraLocal: () => Promise<TCacheLeitura>;
  lerEstadoHistoricoLocal: () => Promise<LocalHistoryUiStateSnapshot>;
  lerFilaOfflineLocal: () => Promise<TFilaOffline[]>;
  lerNotificacoesLocais: () => Promise<TNotificacao[]>;
  limparCachePorPrivacidade: (cache: TCacheLeitura) => TCacheLeitura;
  cacheLeituraVazio: TCacheLeitura;
  onSetFilaOffline: (items: TFilaOffline[]) => void;
  onSetNotificacoes: (items: TNotificacao[]) => void;
  onSetCacheLeitura: (cache: TCacheLeitura) => void;
  onSetLaudosFixadosIds: (ids: number[]) => void;
  onSetHistoricoOcultoIds: (ids: number[]) => void;
  onSetUsandoCacheOffline: (value: boolean) => void;
  onSetLaudosDisponiveis: (items: MobileLaudoCard[]) => void;
  onSetConversa: (conversa: TConversa) => void;
  onSetMensagensMesa: (items: MobileMesaMessage[]) => void;
  onSetLaudoMesaCarregado: (laudoId: number | null) => void;
  onSetErroLaudos: (value: string) => void;
  onApplyBootstrapCache: (bootstrap: MobileBootstrapResponse) => void;
  onAfterLoginSuccess?: () => void;
  onResetAfterLogout?: () => void | Promise<void>;
}

export function useInspectorSession<
  TFilaOffline,
  TNotificacao,
  TCacheLeitura,
  TConversa,
>(
  params: UseInspectorSessionParams<
    TFilaOffline,
    TNotificacao,
    TCacheLeitura,
    TConversa
  >,
) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [statusApi, setStatusApi] =
    useState<InspectorSessionState["statusApi"]>("checking");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [session, setSession] = useState<MobileSessionState | null>(null);

  async function bootstrapApp() {
    const current = paramsRef.current;
    setCarregando(true);
    setErro("");
    await runBootstrapAppFlow({
      aplicarPreferenciasLaudos: current.aplicarPreferenciasLaudos,
      carregarBootstrapMobile,
      chaveCacheLaudo: current.chaveCacheLaudo,
      chatHistoryEnabled: current.chatHistoryEnabled,
      deviceBackupEnabled: current.deviceBackupEnabled,
      erroSugereModoOffline: current.erroSugereModoOffline,
      lerCacheLeituraLocal: current.lerCacheLeituraLocal,
      lerEstadoHistoricoLocal: current.lerEstadoHistoricoLocal,
      lerFilaOfflineLocal: current.lerFilaOfflineLocal,
      lerNotificacoesLocais: current.lerNotificacoesLocais,
      limparCachePorPrivacidade: current.limparCachePorPrivacidade,
      obterItemSeguro: readSecureItem,
      pingApi,
      removeToken: async () => {
        await removeSecureItem(TOKEN_KEY);
      },
      CACHE_LEITURA_VAZIO: current.cacheLeituraVazio,
      EMAIL_KEY,
      TOKEN_KEY,
      onSetStatusApi: setStatusApi,
      onSetEmail: setEmail,
      onSetFilaOffline: current.onSetFilaOffline,
      onSetNotificacoes: current.onSetNotificacoes,
      onSetCacheLeitura: current.onSetCacheLeitura,
      onSetLaudosFixadosIds: current.onSetLaudosFixadosIds,
      onSetHistoricoOcultoIds: current.onSetHistoricoOcultoIds,
      onMergeCacheBootstrap: current.onApplyBootstrapCache,
      onSetSession: setSession,
      onSetUsandoCacheOffline: current.onSetUsandoCacheOffline,
      onSetLaudosDisponiveis: current.onSetLaudosDisponiveis,
      onSetConversa: current.onSetConversa,
      onSetMensagensMesa: current.onSetMensagensMesa,
      onSetLaudoMesaCarregado: current.onSetLaudoMesaCarregado,
      onSetErroLaudos: current.onSetErroLaudos,
    });
    setCarregando(false);
  }

  useEffect(() => {
    if (!params.settingsHydrated) {
      return;
    }
    void bootstrapApp();
  }, [params.settingsHydrated]);

  async function handleLogin() {
    if (!email.trim() || !senha.trim()) {
      setErro("Preencha e-mail e senha para entrar no app.");
      return;
    }

    const current = paramsRef.current;
    setEntrando(true);
    setErro("");

    try {
      const login = await loginInspectorMobile(email, senha, lembrar);
      const bootstrap = await carregarBootstrapMobile(login.access_token);

      if (lembrar) {
        await Promise.all([
          writeSecureItem(TOKEN_KEY, login.access_token),
          writeSecureItem(EMAIL_KEY, email.trim()),
        ]);
      } else {
        await Promise.all([
          removeSecureItem(TOKEN_KEY),
          removeSecureItem(EMAIL_KEY),
        ]);
      }

      setSenha("");
      current.onSetUsandoCacheOffline(false);
      current.onApplyBootstrapCache(bootstrap);
      current.onAfterLoginSuccess?.();
      setSession({ accessToken: login.access_token, bootstrap });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao autenticar no app.";
      setErro(message);
    } finally {
      setEntrando(false);
    }
  }

  async function handleLogout() {
    const current = paramsRef.current;
    try {
      if (session) {
        await logoutInspectorMobile(session.accessToken);
      }
    } catch {
      // Mantem a saida local mesmo se o backend ja tiver expirado o token.
    } finally {
      await removeSecureItem(TOKEN_KEY);
      setSession(null);
      await current.onResetAfterLogout?.();
    }
  }

  return {
    state: {
      email,
      senha,
      lembrar,
      mostrarSenha,
      statusApi,
      erro,
      carregando,
      entrando,
      session,
    } satisfies InspectorSessionState,
    actions: {
      bootstrapApp,
      handleLogin,
      handleLogout,
      setCarregando,
      setEmail,
      setEntrando,
      setErro,
      setLembrar,
      setMostrarSenha,
      setSenha,
      setSession,
      setStatusApi,
    },
  };
}
