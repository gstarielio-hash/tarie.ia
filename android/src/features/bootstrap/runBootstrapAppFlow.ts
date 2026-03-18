import type { MobileBootstrapResponse, MobileLaudoCard, MobileMesaMessage } from "../../types/mobile";

type BootstrapCacheState = any;

interface BootstrapSessionState {
  accessToken: string;
  bootstrap: MobileBootstrapResponse;
}

interface RunBootstrapAppFlowParams {
  applyLocalPreferences: (preferencias: Record<string, unknown>) => void;
  aplicarPreferenciasLaudos: (
    itens: MobileLaudoCard[],
    fixadosIds: number[],
    ocultosIds: number[],
  ) => MobileLaudoCard[];
  carregarBootstrapMobile: (accessToken: string) => Promise<MobileBootstrapResponse>;
  chaveCacheLaudo: (laudoId: number | null) => string;
  erroSugereModoOffline: (error: unknown) => boolean;
  lerCacheLeituraLocal: () => Promise<BootstrapCacheState>;
  lerFilaOfflineLocal: () => Promise<any[]>;
  lerNotificacoesLocais: () => Promise<any[]>;
  lerPreferenciasLocais: () => Promise<Record<string, unknown>>;
  limparCachePorPrivacidade: (cache: BootstrapCacheState) => BootstrapCacheState;
  obterItemSeguro: (key: string) => Promise<string | null>;
  pingApi: () => Promise<boolean>;
  removeToken: () => Promise<void>;
  CACHE_LEITURA_VAZIO: BootstrapCacheState;
  EMAIL_KEY: string;
  TOKEN_KEY: string;
  onSetStatusApi: (status: "online" | "offline") => void;
  onSetEmail: (email: string) => void;
  onSetFilaOffline: (itens: any[]) => void;
  onSetNotificacoes: (itens: any[]) => void;
  onSetCacheLeitura: (cache: any) => void;
  onMergeCacheBootstrap: (bootstrap: MobileBootstrapResponse) => void;
  onSetSession: (session: BootstrapSessionState) => void;
  onSetUsandoCacheOffline: (value: boolean) => void;
  onSetLaudosDisponiveis: (itens: MobileLaudoCard[]) => void;
  onSetConversa: (conversa: any) => void;
  onSetMensagensMesa: (itens: MobileMesaMessage[]) => void;
  onSetLaudoMesaCarregado: (laudoId: number | null) => void;
  onSetErroLaudos: (value: string) => void;
}

export async function runBootstrapAppFlow({
  applyLocalPreferences,
  aplicarPreferenciasLaudos,
  carregarBootstrapMobile,
  chaveCacheLaudo,
  erroSugereModoOffline,
  lerCacheLeituraLocal,
  lerFilaOfflineLocal,
  lerNotificacoesLocais,
  lerPreferenciasLocais,
  limparCachePorPrivacidade,
  obterItemSeguro,
  pingApi,
  removeToken,
  CACHE_LEITURA_VAZIO,
  EMAIL_KEY,
  TOKEN_KEY,
  onSetStatusApi,
  onSetEmail,
  onSetFilaOffline,
  onSetNotificacoes,
  onSetCacheLeitura,
  onMergeCacheBootstrap,
  onSetSession,
  onSetUsandoCacheOffline,
  onSetLaudosDisponiveis,
  onSetConversa,
  onSetMensagensMesa,
  onSetLaudoMesaCarregado,
  onSetErroLaudos,
}: RunBootstrapAppFlowParams) {
  const [online, savedEmail, savedToken, filaLocal, notificacoesLocais, cacheLocal, preferenciasLocais] =
    await Promise.all([
      pingApi(),
      obterItemSeguro(EMAIL_KEY),
      obterItemSeguro(TOKEN_KEY),
      lerFilaOfflineLocal(),
      lerNotificacoesLocais(),
      lerCacheLeituraLocal(),
      lerPreferenciasLocais(),
    ]);

  onSetStatusApi(online ? "online" : "offline");
  if (savedEmail) {
    onSetEmail(savedEmail);
  }
  applyLocalPreferences(preferenciasLocais);
  onSetFilaOffline(filaLocal);
  onSetNotificacoes(notificacoesLocais);
  onSetCacheLeitura(
    preferenciasLocais.backupAutomatico === false
      ? CACHE_LEITURA_VAZIO
      : preferenciasLocais.salvarHistoricoConversas === false
        ? limparCachePorPrivacidade(cacheLocal)
        : cacheLocal,
  );

  if (!savedToken) {
    return;
  }

  try {
    const bootstrap = await carregarBootstrapMobile(savedToken);
    onSetUsandoCacheOffline(false);
    onMergeCacheBootstrap(bootstrap);
    onSetSession({ accessToken: savedToken, bootstrap });
  } catch (error) {
    const erroOffline = !online || erroSugereModoOffline(error);
    if (erroOffline && cacheLocal.bootstrap) {
      const conversaCache = cacheLocal.conversaAtual;
      const mesaCache = conversaCache?.laudoId
        ? cacheLocal.mesaPorLaudo[chaveCacheLaudo(conversaCache.laudoId)] || []
        : [];
      const laudosCache = aplicarPreferenciasLaudos(
        cacheLocal.laudos,
        Array.isArray(preferenciasLocais.laudosFixadosIds) ? preferenciasLocais.laudosFixadosIds : [],
        Array.isArray(preferenciasLocais.historicoOcultoIds) ? preferenciasLocais.historicoOcultoIds : [],
      );

      onSetSession({ accessToken: savedToken, bootstrap: cacheLocal.bootstrap });
      onSetLaudosDisponiveis(laudosCache);
      onSetConversa(conversaCache);
      onSetMensagensMesa(mesaCache);
      onSetLaudoMesaCarregado(conversaCache?.laudoId ?? null);
      onSetUsandoCacheOffline(true);
      if (!laudosCache.length) {
        onSetErroLaudos("Sem internet. Nenhum laudo salvo localmente ainda.");
      }
      return;
    }

    if (!erroOffline) {
      await removeToken();
    }
  }
}
