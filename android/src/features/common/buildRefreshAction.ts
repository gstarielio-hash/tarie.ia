import type { ApiHealthStatus } from "../../types/mobile";
import type {
  MobileActivityNotification,
  OfflinePendingMessage,
} from "../chat/types";
import type { MobileSessionState } from "../session/sessionTypes";

interface BuildRefreshActionParams {
  abaAtiva: "chat" | "mesa";
  carregarConversaAtual: (
    accessToken: string,
    silencioso?: boolean,
  ) => Promise<{ laudoId: number | null } | null>;
  carregarListaLaudos: (
    accessToken: string,
    silencioso?: boolean,
  ) => Promise<unknown>;
  carregarMesaAtual: (
    accessToken: string,
    laudoId: number,
    silencioso?: boolean,
  ) => Promise<unknown>;
  conversa: { laudoId: number | null } | null;
  criarNotificacaoSistema: (params: {
    title: string;
    body: string;
    kind?: "system" | "alerta_critico";
  }) => MobileActivityNotification;
  filaOffline: OfflinePendingMessage[];
  onCanSyncOnCurrentNetwork: (wifiOnlySync: boolean) => Promise<boolean>;
  onIsOfflineItemReadyForRetry: (item: OfflinePendingMessage) => boolean;
  onPingApi: () => Promise<boolean>;
  onRegistrarNotificacoes: (items: MobileActivityNotification[]) => void;
  onSetErroConversa: (value: string) => void;
  onSetErroMesa: (value: string) => void;
  onSetSincronizandoAgora: (value: boolean) => void;
  onSetStatusApi: (value: ApiHealthStatus) => void;
  onSetUsandoCacheOffline: (value: boolean) => void;
  session: MobileSessionState | null;
  sincronizacaoDispositivos: boolean;
  sincronizarFilaOffline: (
    accessToken: string,
    automatic?: boolean,
  ) => Promise<void>;
  wifiOnlySync: boolean;
}

export function buildRefreshAction({
  abaAtiva,
  carregarConversaAtual,
  carregarListaLaudos,
  carregarMesaAtual,
  conversa,
  criarNotificacaoSistema,
  filaOffline,
  onCanSyncOnCurrentNetwork,
  onIsOfflineItemReadyForRetry,
  onPingApi,
  onRegistrarNotificacoes,
  onSetErroConversa,
  onSetErroMesa,
  onSetSincronizandoAgora,
  onSetStatusApi,
  onSetUsandoCacheOffline,
  session,
  sincronizacaoDispositivos,
  sincronizarFilaOffline,
  wifiOnlySync,
}: BuildRefreshActionParams) {
  return async function handleRefresh() {
    onSetSincronizandoAgora(true);
    try {
      const online = await onPingApi();
      onSetStatusApi(online ? "online" : "offline");

      if (session) {
        if (!(await onCanSyncOnCurrentNetwork(wifiOnlySync))) {
          const mensagem =
            "Sincronização limitada ao Wi-Fi nas configurações de dados.";
          onSetErroConversa(mensagem);
          onSetErroMesa(mensagem);
          onRegistrarNotificacoes([
            criarNotificacaoSistema({
              title: "Sincronização aguardando Wi-Fi",
              body: mensagem,
            }),
          ]);
          return;
        }
        if (
          online &&
          sincronizacaoDispositivos &&
          filaOffline.some((item) => onIsOfflineItemReadyForRetry(item))
        ) {
          await sincronizarFilaOffline(session.accessToken, true);
        }
        await carregarListaLaudos(session.accessToken, true);
        const proximaConversa = await carregarConversaAtual(
          session.accessToken,
          true,
        );
        const laudoAtual =
          proximaConversa?.laudoId ?? conversa?.laudoId ?? null;
        if (abaAtiva === "mesa" && laudoAtual) {
          await carregarMesaAtual(session.accessToken, laudoAtual, true);
        }
        if (online) {
          onSetUsandoCacheOffline(false);
        }
        onRegistrarNotificacoes([
          criarNotificacaoSistema({
            title: "Sincronização concluída",
            body: "Os dados locais foram atualizados com sucesso.",
          }),
        ]);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível sincronizar agora.";
      onSetErroConversa(message);
      onSetErroMesa(message);
      onRegistrarNotificacoes([
        criarNotificacaoSistema({
          kind: "alerta_critico",
          title: "Falha ao sincronizar",
          body: message,
        }),
      ]);
    } finally {
      onSetSincronizandoAgora(false);
    }
  };
}
