import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Vibration } from "react-native";

import { pingApi } from "../../config/api";
import { registrarEventoObservabilidade } from "../../config/observability";
import type {
  MobileLaudoCard,
  MobileMesaMensagensResponse,
  MobileMesaMessage,
} from "../../types/mobile";
import { runMonitorActivityFlow } from "./monitorActivityFlow";
import {
  initializeNotificationsRuntime,
  scheduleLocalActivityNotification,
  syncNotificationChannels,
} from "../chat/notifications";
import { canSyncOnCurrentNetwork } from "../chat/network";
import type {
  ActiveThread,
  MobileActivityNotification as ActivityNotificationBase,
} from "../chat/types";
import type { MobileSessionState } from "../session/sessionTypes";
import type { AppSettings } from "../../settings";

interface ActivityConversationLike {
  laudoId: number | null;
  laudoCard: MobileLaudoCard | null;
}

interface UseActivityCenterControllerParams<
  TConversation extends ActivityConversationLike,
  TNotification extends ActivityNotificationBase,
> {
  session: MobileSessionState | null;
  sessionLoading: boolean;
  statusApi: string;
  wifiOnlySync: boolean;
  syncEnabled: boolean;
  activeThread: ActiveThread;
  conversation: TConversation | null;
  laudosDisponiveis: MobileLaudoCard[];
  laudoMesaCarregado: number | null;
  messagesMesa: MobileMesaMessage[];
  monitorIntervalMs: number;
  notifications: TNotification[];
  notificationSettings: AppSettings["notifications"];
  notificationsPermissionGranted: boolean;
  setNotifications: Dispatch<SetStateAction<TNotification[]>>;
  setActivityCenterVisible: Dispatch<SetStateAction<boolean>>;
  openLaudoById: (accessToken: string, laudoId: number) => Promise<void>;
  setActiveThread: Dispatch<SetStateAction<ActiveThread>>;
  carregarMesaAtual: (
    accessToken: string,
    laudoId: number,
    silencioso?: boolean,
  ) => Promise<void>;
  onRecoverOnline: () => Promise<void>;
  saveNotificationsLocally: (items: TNotification[]) => Promise<void>;
  assinaturaStatusLaudo: (item: MobileLaudoCard) => string;
  assinaturaMensagemMesa: (item: MobileMesaMessage) => string;
  selecionarLaudosParaMonitoramentoMesa: (params: {
    laudos: MobileLaudoCard[];
    laudoAtivoId: number | null;
  }) => number[];
  criarNotificacaoStatusLaudo: (item: MobileLaudoCard) => TNotification;
  criarNotificacaoMesa: (
    kind: "mesa_nova" | "mesa_resolvida" | "mesa_reaberta",
    item: MobileMesaMessage,
    tituloLaudo: string,
  ) => TNotification;
  erroSugereModoOffline: (error: unknown) => boolean;
  chaveCacheLaudo: (laudoId: number | null) => string;
  onUpdateCurrentConversationSummary: (
    payload: MobileMesaMensagensResponse,
  ) => void;
  onSetLaudosDisponiveis: Dispatch<SetStateAction<MobileLaudoCard[]>>;
  onSetCacheLaudos: (items: MobileLaudoCard[]) => void;
  onSetErroLaudos: Dispatch<SetStateAction<string>>;
  onSetMensagensMesa: Dispatch<SetStateAction<MobileMesaMessage[]>>;
  onSetLaudoMesaCarregado: Dispatch<SetStateAction<number | null>>;
  onSetCacheMesa: (itemsByLaudo: Record<string, MobileMesaMessage[]>) => void;
  onSetStatusApi: (value: "online" | "offline") => void;
  onSetErroConversaIfEmpty: (value: string) => void;
  maxNotifications: number;
}

export function useActivityCenterController<
  TConversation extends ActivityConversationLike,
  TNotification extends ActivityNotificationBase,
>(params: UseActivityCenterControllerParams<TConversation, TNotification>) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [monitorandoAtividade, setMonitorandoAtividade] = useState(false);
  const statusSnapshotRef = useRef<Record<number, string>>({});
  const mesaSnapshotRef = useRef<Record<number, Record<number, string>>>({});
  const mesaFeedCursorRef = useRef("");

  function marcarCentralAtividadeComoLida() {
    paramsRef.current.setNotifications((estadoAtual) =>
      estadoAtual.map((item) =>
        item.unread ? { ...item, unread: false } : item,
      ),
    );
  }

  function handleAbrirCentralAtividade() {
    paramsRef.current.setActivityCenterVisible(true);
    marcarCentralAtividadeComoLida();
  }

  function registrarNotificacoes(novas: TNotification[]) {
    const current = paramsRef.current;
    if (!novas.length) {
      return;
    }

    const novasNormalizadas = novas.map((item) => {
      let body = item.body;
      if (current.notificationSettings.onlyShowNewMessage) {
        body = "Nova mensagem";
      } else if (
        !current.notificationSettings.showMessageContent ||
        current.notificationSettings.hideContentOnLockScreen
      ) {
        body =
          item.kind === "status"
            ? "Há uma atualização no laudo."
            : item.kind === "system"
              ? "Há uma atualização no aplicativo."
              : item.kind === "alerta_critico"
                ? "Há um alerta crítico no aplicativo."
                : "Há uma nova interação na conversa.";
      }

      return {
        ...item,
        body,
      };
    });
    const idsExistentes = new Set(current.notifications.map((item) => item.id));
    const novasUnicas = novasNormalizadas.filter(
      (item) => !idsExistentes.has(item.id),
    );

    current.setNotifications((estadoAtual) => {
      const mapa = new Map(estadoAtual.map((item) => [item.id, item]));
      for (const item of novasNormalizadas) {
        if (!mapa.has(item.id)) {
          mapa.set(item.id, item);
        }
      }

      return Array.from(mapa.values())
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, current.maxNotifications);
    });

    const novasParaPush = current.notificationSettings.responseAlertsEnabled
      ? novasUnicas
      : novasUnicas.filter(
          (item) =>
            item.kind === "status" ||
            item.kind === "system" ||
            item.kind === "alerta_critico",
        );

    if (
      !current.notificationsPermissionGranted ||
      !current.notificationSettings.pushEnabled
    ) {
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_dispatch_blocked",
        ok: false,
        count: novasParaPush.length,
        detail: !current.notificationsPermissionGranted
          ? "permission_denied"
          : "push_disabled",
      });
      return;
    }

    if (!novasParaPush.length) {
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_dispatch_filtered",
        ok: true,
        count: novas.length,
        detail: "responses_disabled",
      });
      return;
    }

    if (current.notificationSettings.vibrationEnabled) {
      Vibration.vibrate(18);
    }
    void Promise.all(
      novasParaPush.map((notification) =>
        scheduleLocalActivityNotification({
          notification,
          settings: current.notificationSettings,
        }),
      ),
    );
    void registrarEventoObservabilidade({
      kind: "push",
      name: "push_dispatch",
      ok: true,
      count: novasParaPush.length,
      detail: current.notificationSettings.onlyShowNewMessage
        ? "preview_hidden"
        : "preview_visible",
    });
  }

  async function handleAbrirNotificacao(item: TNotification) {
    const current = paramsRef.current;
    if (!current.session) {
      return;
    }

    current.setActivityCenterVisible(false);
    current.setNotifications((estadoAtual) =>
      estadoAtual.map((registro) =>
        registro.id === item.id && registro.unread
          ? { ...registro, unread: false }
          : registro,
      ),
    );

    if (!item.laudoId) {
      return;
    }

    await current.openLaudoById(current.session.accessToken, item.laudoId);
    current.setActiveThread(item.targetThread);

    if (item.targetThread === "mesa") {
      await current.carregarMesaAtual(
        current.session.accessToken,
        item.laudoId,
        true,
      );
    }
  }

  async function monitorarAtividade(accessToken: string) {
    const current = paramsRef.current;
    if (!(await canSyncOnCurrentNetwork(current.wifiOnlySync))) {
      return;
    }

    await runMonitorActivityFlow<TNotification>({
      accessToken,
      monitorandoAtividade,
      conversaLaudoId: current.conversation?.laudoId ?? null,
      conversaLaudoTitulo: current.conversation?.laudoCard?.titulo || "",
      sessionUserId: current.session?.bootstrap.usuario.id ?? null,
      assinaturaStatusLaudo: current.assinaturaStatusLaudo,
      assinaturaMensagemMesa: current.assinaturaMensagemMesa,
      selecionarLaudosParaMonitoramentoMesa:
        current.selecionarLaudosParaMonitoramentoMesa,
      criarNotificacaoStatusLaudo: current.criarNotificacaoStatusLaudo,
      criarNotificacaoMesa: current.criarNotificacaoMesa,
      atualizarResumoLaudoAtual: current.onUpdateCurrentConversationSummary,
      registrarNotificacoes,
      erroSugereModoOffline: current.erroSugereModoOffline,
      chaveCacheLaudo: current.chaveCacheLaudo,
      statusSnapshotRef,
      mesaSnapshotRef,
      mesaFeedCursorRef,
      onSetMonitorandoAtividade: setMonitorandoAtividade,
      onSetLaudosDisponiveis: current.onSetLaudosDisponiveis,
      onSetCacheLaudos: current.onSetCacheLaudos,
      onSetErroLaudos: current.onSetErroLaudos,
      onSetMensagensMesa: current.onSetMensagensMesa,
      onSetLaudoMesaCarregado: (laudoId) =>
        current.onSetLaudoMesaCarregado(laudoId),
      onSetCacheMesa: current.onSetCacheMesa,
      onSetStatusApi: current.onSetStatusApi,
      onSetErroConversaIfEmpty: current.onSetErroConversaIfEmpty,
    });
  }

  useEffect(() => {
    initializeNotificationsRuntime();
  }, []);

  useEffect(() => {
    void syncNotificationChannels(params.notificationSettings);
  }, [params.notificationSettings]);

  useEffect(() => {
    if (params.sessionLoading) {
      return;
    }
    void params.saveNotificationsLocally(params.notifications);
  }, [
    params.notifications,
    params.saveNotificationsLocally,
    params.sessionLoading,
  ]);

  useEffect(() => {
    if (params.session) {
      return;
    }
    setMonitorandoAtividade(false);
    statusSnapshotRef.current = {};
    mesaSnapshotRef.current = {};
    mesaFeedCursorRef.current = "";
  }, [params.session]);

  useEffect(() => {
    if (!params.session) {
      return;
    }

    const statusAtual: Record<number, string> = {};
    for (const item of params.laudosDisponiveis) {
      statusAtual[item.id] = params.assinaturaStatusLaudo(item);
    }
    statusSnapshotRef.current = statusAtual;
  }, [params.assinaturaStatusLaudo, params.laudosDisponiveis, params.session]);

  useEffect(() => {
    if (
      !params.session ||
      !params.conversation?.laudoId ||
      params.laudoMesaCarregado !== params.conversation.laudoId
    ) {
      return;
    }

    mesaSnapshotRef.current[params.conversation.laudoId] = Object.fromEntries(
      params.messagesMesa.map((item) => [
        item.id,
        params.assinaturaMensagemMesa(item),
      ]),
    );
  }, [
    params.assinaturaMensagemMesa,
    params.conversation?.laudoId,
    params.laudoMesaCarregado,
    params.messagesMesa,
    params.session,
  ]);

  useEffect(() => {
    if (!params.session || !params.syncEnabled) {
      return;
    }

    let cancelado = false;
    const intervalo = setInterval(() => {
      if (cancelado) {
        return;
      }

      const current = paramsRef.current;

      if (current.statusApi === "offline") {
        void (async () => {
          const online = await pingApi();
          if (!online || cancelado) {
            return;
          }
          if (!(await canSyncOnCurrentNetwork(current.wifiOnlySync))) {
            return;
          }
          current.onSetStatusApi("online");
          await current.onRecoverOnline();
        })();
        return;
      }

      void monitorarAtividade(current.session!.accessToken);
    }, params.monitorIntervalMs);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [
    monitorandoAtividade,
    params.monitorIntervalMs,
    params.session,
    params.statusApi,
    params.syncEnabled,
  ]);

  return {
    state: {
      monitorandoAtividade,
    },
    actions: {
      handleAbrirCentralAtividade,
      handleAbrirNotificacao,
      marcarCentralAtividadeComoLida,
      registrarNotificacoes,
    },
  };
}
