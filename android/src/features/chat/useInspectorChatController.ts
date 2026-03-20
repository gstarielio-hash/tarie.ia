import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { Alert, type ScrollView } from "react-native";

import {
  carregarLaudosMobile,
  carregarMensagensLaudo,
  carregarStatusLaudo,
  reabrirLaudoMobile,
} from "../../config/api";
import type {
  MobileChatMessage,
  MobileChatMode,
  MobileChatSendResult,
  MobileEstadoLaudo,
  MobileLaudoCard,
  MobileLaudoMensagensResponse,
  MobileLaudoStatusResponse,
  MobileMesaMessage,
} from "../../types/mobile";
import { type AppSettings } from "../../settings";
import { sendInspectorMessageFlow } from "./messageSendFlows";
import { gateHeavyTransfer } from "./network";
import { speakAssistantResponse } from "./voice";
import type { ActiveThread, ChatState, ComposerAttachment } from "./types";
import type { ChatAiRequestConfig } from "./preferences";
import type { MobileSessionState } from "../session/sessionTypes";

interface ChatCacheState {
  laudos: MobileLaudoCard[];
  conversaAtual: ChatState | null;
  conversasPorLaudo: Record<string, ChatState>;
  mesaPorLaudo: Record<string, MobileMesaMessage[]>;
  updatedAt: string;
}

interface UpdateConversationSummaryPayload {
  estado: MobileEstadoLaudo | string;
  permite_edicao: boolean;
  permite_reabrir: boolean;
  laudo_card: MobileLaudoCard | null;
  modo?: MobileChatMode | string;
}

interface UseInspectorChatControllerParams<
  TOfflineItem,
  TCacheLeitura extends ChatCacheState,
> {
  session: MobileSessionState | null;
  sessionLoading: boolean;
  activeThread: ActiveThread;
  statusApi: string;
  wifiOnlySync: boolean;
  aiRequestConfig: ChatAiRequestConfig;
  speechSettings: AppSettings["speech"];
  cacheLeitura: TCacheLeitura;
  conversation: ChatState | null;
  setConversation: Dispatch<SetStateAction<ChatState | null>>;
  laudosDisponiveis: MobileLaudoCard[];
  setLaudosDisponiveis: Dispatch<SetStateAction<MobileLaudoCard[]>>;
  laudosFixadosIds: number[];
  historicoOcultoIds: number[];
  laudoMesaCarregado: number | null;
  setLaudoMesaCarregado: Dispatch<SetStateAction<number | null>>;
  setMensagensMesa: Dispatch<SetStateAction<MobileMesaMessage[]>>;
  setErroMesa: Dispatch<SetStateAction<string>>;
  setMensagemMesa: Dispatch<SetStateAction<string>>;
  setAnexoMesaRascunho: Dispatch<SetStateAction<ComposerAttachment | null>>;
  clearMesaReference: () => void;
  onSetActiveThread: (value: ActiveThread) => void;
  message: string;
  setMessage: Dispatch<SetStateAction<string>>;
  attachmentDraft: ComposerAttachment | null;
  setAttachmentDraft: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setErrorConversation: Dispatch<SetStateAction<string>>;
  setSendingMessage: Dispatch<SetStateAction<boolean>>;
  setLoadingConversation: Dispatch<SetStateAction<boolean>>;
  setSyncConversation: Dispatch<SetStateAction<boolean>>;
  setLoadingLaudos: Dispatch<SetStateAction<boolean>>;
  setErrorLaudos: Dispatch<SetStateAction<string>>;
  highlightedMessageId: number | null;
  setHighlightedMessageId: Dispatch<SetStateAction<number | null>>;
  layoutVersion: number;
  setLayoutVersion: Dispatch<SetStateAction<number>>;
  scrollRef: MutableRefObject<ScrollView | null>;
  setFilaOffline: Dispatch<SetStateAction<TOfflineItem[]>>;
  setStatusApi: (value: "online" | "offline") => void;
  setUsandoCacheOffline: (value: boolean) => void;
  setCacheLeitura: Dispatch<SetStateAction<TCacheLeitura>>;
  carregarMesaAtual: (
    accessToken: string,
    laudoId: number,
    silencioso?: boolean,
  ) => Promise<void>;
  aplicarPreferenciasLaudos: (
    itens: MobileLaudoCard[],
    fixadosIds: number[],
    ocultosIds: number[],
  ) => MobileLaudoCard[];
  chaveCacheLaudo: (laudoId: number | null) => string;
  chaveRascunho: (thread: ActiveThread, laudoId: number | null) => string;
  erroSugereModoOffline: (error: unknown) => boolean;
  normalizarConversa: (
    payload: MobileLaudoStatusResponse | MobileLaudoMensagensResponse,
  ) => ChatState;
  atualizarResumoLaudoAtual: (
    estadoAtual: ChatState | null,
    payload: UpdateConversationSummaryPayload,
  ) => ChatState | null;
  criarConversaNova: () => ChatState;
  podeEditarConversaNoComposer: (
    conversa: ChatState | null | undefined,
  ) => boolean;
  textoFallbackAnexo: (anexo: ComposerAttachment | null) => string;
  normalizarModoChat: (
    modo: unknown,
    fallback?: MobileChatMode,
  ) => MobileChatMode;
  inferirSetorConversa: (conversa: ChatState | null | undefined) => string;
  montarHistoricoParaEnvio: (
    mensagens: MobileChatMessage[],
  ) => Array<{ papel: "usuario" | "assistente"; texto: string }>;
  criarMensagemAssistenteServidor: (
    resposta: MobileChatSendResult,
  ) => MobileChatMessage | null;
  criarItemFilaOffline: (params: {
    channel: "chat";
    laudoId: number | null;
    text: string;
    title: string;
    attachment: ComposerAttachment | null;
    aiMode: MobileChatMode;
    aiSummary: string;
    aiMessagePrefix: string;
  }) => TOfflineItem;
}

export function useInspectorChatController<
  TOfflineItem,
  TCacheLeitura extends ChatCacheState,
>(params: UseInspectorChatControllerParams<TOfflineItem, TCacheLeitura>) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const chatMessageOffsetsRef = useRef<Record<number, number>>({});
  const chatHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const chatDraftKeyRef = useRef("");
  const chatAttachmentDraftKeyRef = useRef("");

  function resetChatState() {
    const current = paramsRef.current;
    current.setConversation(null);
    current.setMessage("");
    current.setAttachmentDraft(null);
    current.setErrorConversation("");
    current.setLaudosDisponiveis([]);
    current.setErrorLaudos("");
    current.setHighlightedMessageId(null);
    current.setLayoutVersion(0);
    current.setLoadingConversation(false);
    current.setSyncConversation(false);
    current.setLoadingLaudos(false);
    current.setSendingMessage(false);
    chatMessageOffsetsRef.current = {};
    if (chatHighlightTimeoutRef.current) {
      clearTimeout(chatHighlightTimeoutRef.current);
      chatHighlightTimeoutRef.current = null;
    }
  }

  async function carregarConversaAtual(
    accessToken: string,
    silencioso = false,
  ): Promise<ChatState | null> {
    const current = paramsRef.current;
    if (silencioso) {
      current.setSyncConversation(true);
    } else {
      current.setLoadingConversation(true);
    }
    current.setErrorConversation("");

    try {
      const status = await carregarStatusLaudo(accessToken);
      let proximaConversa = current.normalizarConversa(status);

      if (status.laudo_id) {
        const historico = await carregarMensagensLaudo(
          accessToken,
          status.laudo_id,
        );
        proximaConversa = current.normalizarConversa(historico);
      }

      current.setConversation(proximaConversa);
      current.setUsandoCacheOffline(false);
      current.setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        conversaAtual: proximaConversa,
        conversasPorLaudo: {
          ...estadoAtual.conversasPorLaudo,
          [current.chaveCacheLaudo(proximaConversa.laudoId)]: proximaConversa,
        },
        updatedAt: new Date().toISOString(),
      }));
      if (proximaConversa.laudoId !== current.laudoMesaCarregado) {
        current.setMensagensMesa([]);
        current.setErroMesa("");
        current.setMensagemMesa("");
        current.setLaudoMesaCarregado(null);
      }
      return proximaConversa;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar a conversa do inspetor.";
      const emModoOffline =
        current.statusApi === "offline" || current.erroSugereModoOffline(error);
      const cacheKey = current.chaveCacheLaudo(
        current.conversation?.laudoId ?? null,
      );
      const conversaCache =
        current.cacheLeitura.conversasPorLaudo[cacheKey] ||
        current.cacheLeitura.conversaAtual;
      if (emModoOffline && conversaCache) {
        current.setConversation(conversaCache);
        current.setUsandoCacheOffline(true);
        current.setErrorConversation("");
        return conversaCache;
      }
      current.setErrorConversation(message);
      return null;
    } finally {
      current.setLoadingConversation(false);
      current.setSyncConversation(false);
    }
  }

  async function carregarListaLaudos(
    accessToken: string,
    silencioso = false,
  ): Promise<MobileLaudoCard[]> {
    const current = paramsRef.current;
    if (!silencioso) {
      current.setLoadingLaudos(true);
    }
    current.setErrorLaudos("");

    try {
      const payload = await carregarLaudosMobile(accessToken);
      const laudosNormalizados = current.aplicarPreferenciasLaudos(
        payload.itens || [],
        current.laudosFixadosIds,
        current.historicoOcultoIds,
      );
      current.setLaudosDisponiveis(laudosNormalizados);
      current.setUsandoCacheOffline(false);
      current.setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        laudos: laudosNormalizados,
        updatedAt: new Date().toISOString(),
      }));
      return laudosNormalizados;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar os laudos do inspetor.";
      const emModoOffline =
        current.statusApi === "offline" || current.erroSugereModoOffline(error);
      if (emModoOffline && current.cacheLeitura.laudos.length) {
        const laudosCache = current.aplicarPreferenciasLaudos(
          current.cacheLeitura.laudos,
          current.laudosFixadosIds,
          current.historicoOcultoIds,
        );
        current.setLaudosDisponiveis(laudosCache);
        current.setUsandoCacheOffline(true);
        current.setErrorLaudos("");
        return laudosCache;
      }
      current.setErrorLaudos(message);
      return [];
    } finally {
      current.setLoadingLaudos(false);
    }
  }

  async function abrirLaudoPorId(accessToken: string, laudoId: number) {
    const current = paramsRef.current;
    current.setErrorConversation("");
    current.setErroMesa("");
    current.setMessage("");
    current.setMensagemMesa("");
    current.setAttachmentDraft(null);
    current.setAnexoMesaRascunho(null);
    current.clearMesaReference();
    current.setLoadingConversation(true);

    try {
      const historico = await carregarMensagensLaudo(accessToken, laudoId);
      const proximaConversa = current.normalizarConversa(historico);
      current.setConversation(proximaConversa);
      current.setUsandoCacheOffline(false);
      current.setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        conversaAtual: proximaConversa,
        conversasPorLaudo: {
          ...estadoAtual.conversasPorLaudo,
          [current.chaveCacheLaudo(laudoId)]: proximaConversa,
        },
        updatedAt: new Date().toISOString(),
      }));
      current.setMensagensMesa([]);
      current.setLaudoMesaCarregado(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel abrir o laudo selecionado.";
      const conversaCache =
        current.cacheLeitura.conversasPorLaudo[
          current.chaveCacheLaudo(laudoId)
        ];
      const emModoOffline =
        current.statusApi === "offline" || current.erroSugereModoOffline(error);
      if (emModoOffline && conversaCache) {
        current.setConversation(conversaCache);
        current.setMensagensMesa(
          current.cacheLeitura.mesaPorLaudo[current.chaveCacheLaudo(laudoId)] ||
            [],
        );
        current.setLaudoMesaCarregado(
          (
            current.cacheLeitura.mesaPorLaudo[
              current.chaveCacheLaudo(laudoId)
            ] || []
          ).length
            ? laudoId
            : null,
        );
        current.setUsandoCacheOffline(true);
        return;
      }
      current.setErrorConversation(message);
    } finally {
      current.setLoadingConversation(false);
    }
  }

  async function handleSelecionarLaudo(card: MobileLaudoCard | null) {
    const current = paramsRef.current;
    if (!current.session) {
      return;
    }

    current.setErrorConversation("");
    current.setErroMesa("");
    current.setMessage("");
    current.setMensagemMesa("");
    current.setAttachmentDraft(null);
    current.setAnexoMesaRascunho(null);
    current.onSetActiveThread("chat");

    if (!card) {
      current.setConversation(current.criarConversaNova());
      current.setMensagensMesa([]);
      current.setLaudoMesaCarregado(null);
      return;
    }

    await abrirLaudoPorId(current.session.accessToken, card.id);
  }

  async function handleAbrirNovoChat() {
    await handleSelecionarLaudo(null);
  }

  async function handleReabrir() {
    const current = paramsRef.current;
    if (!current.session || !current.conversation?.laudoId) {
      return;
    }

    try {
      await reabrirLaudoMobile(
        current.session.accessToken,
        current.conversation.laudoId,
      );
      const proximaConversa = await carregarConversaAtual(
        current.session.accessToken,
        true,
      );
      await carregarListaLaudos(current.session.accessToken, true);
      if (current.activeThread === "mesa" && proximaConversa?.laudoId) {
        await current.carregarMesaAtual(
          current.session.accessToken,
          proximaConversa.laudoId,
          true,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel reabrir o laudo.";
      Alert.alert("Reabrir laudo", message);
    }
  }

  async function handleEnviarMensagem() {
    const current = paramsRef.current;
    if (!current.session) {
      return;
    }

    const snapshotConversa = current.conversation;
    const gateAnexo = await gateHeavyTransfer({
      wifiOnlySync: current.wifiOnlySync,
      requiresHeavyTransfer: Boolean(current.attachmentDraft),
      blockedMessage:
        "Anexos foram guardados na fila local e so seguem quando houver Wi-Fi.",
    });
    if (current.attachmentDraft && !gateAnexo.allowed) {
      current.setFilaOffline((estadoAtual) => [
        ...estadoAtual,
        current.criarItemFilaOffline({
          channel: "chat",
          laudoId: snapshotConversa?.laudoId ?? null,
          text: current.message.trim(),
          title: snapshotConversa?.laudoCard?.titulo || "Nova inspecao",
          attachment: current.attachmentDraft,
          aiMode: current.aiRequestConfig.mode,
          aiSummary: current.aiRequestConfig.summaryLabel,
          aiMessagePrefix: current.aiRequestConfig.messagePrefix,
        }),
      ]);
      current.setMessage("");
      current.setAttachmentDraft(null);
      current.setErrorConversation(
        gateAnexo.reason || "Envio local guardado para sincronizar depois.",
      );
      return;
    }

    await sendInspectorMessageFlow<TOfflineItem>({
      mensagem: current.message,
      anexoAtual: current.attachmentDraft,
      snapshotConversa,
      aiRequestConfig: current.aiRequestConfig,
      sessionAccessToken: current.session.accessToken,
      statusApi: current.statusApi,
      podeEditarConversaNoComposer: current.podeEditarConversaNoComposer,
      textoFallbackAnexo: current.textoFallbackAnexo,
      normalizarModoChat: current.normalizarModoChat,
      inferirSetorConversa: current.inferirSetorConversa,
      montarHistoricoParaEnvio: current.montarHistoricoParaEnvio,
      criarMensagemAssistenteServidor: current.criarMensagemAssistenteServidor,
      carregarConversaAtual: async () => {
        await carregarConversaAtual(current.session!.accessToken, true);
      },
      carregarListaLaudos: async () => {
        await carregarListaLaudos(current.session!.accessToken, true);
      },
      erroSugereModoOffline: current.erroSugereModoOffline,
      criarItemFilaOffline: current.criarItemFilaOffline,
      onSetMensagem: current.setMessage,
      onSetAnexoRascunho: current.setAttachmentDraft,
      onSetErroConversa: current.setErrorConversation,
      onSetEnviandoMensagem: current.setSendingMessage,
      onApplyOptimisticMessage: (mensagemOtimista, modoAtivo) => {
        current.setConversation((estadoAtual) => ({
          laudoId: estadoAtual?.laudoId || null,
          estado: estadoAtual?.estado || "sem_relatorio",
          statusCard: estadoAtual?.statusCard || "aberto",
          permiteEdicao: estadoAtual?.permiteEdicao ?? true,
          permiteReabrir: estadoAtual?.permiteReabrir ?? false,
          laudoCard: estadoAtual?.laudoCard || null,
          modo: current.normalizarModoChat(estadoAtual?.modo, modoAtivo),
          mensagens: [...(estadoAtual?.mensagens || []), mensagemOtimista],
        }));
      },
      onApplyAssistantResponse: (respostaChat, mensagemAssistenteServidor) => {
        current.setConversation((estadoAtual) => {
          const base = estadoAtual || current.criarConversaNova();
          return {
            ...base,
            laudoId: respostaChat.laudoId ?? base.laudoId,
            statusCard: respostaChat.laudoCard?.status_card || base.statusCard,
            laudoCard: respostaChat.laudoCard || base.laudoCard,
            modo: current.normalizarModoChat(
              respostaChat.modo,
              current.normalizarModoChat(base.modo),
            ),
            mensagens: mensagemAssistenteServidor
              ? [...base.mensagens, mensagemAssistenteServidor]
              : base.mensagens,
          };
        });
        void speakAssistantResponse({
          text: respostaChat.assistantText,
          speech: current.speechSettings,
        });
      },
      onReverterConversa: () => {
        current.setConversation(snapshotConversa);
      },
      onQueueOfflineItem: (itemFila) => {
        current.setFilaOffline((estadoAtual) => [...estadoAtual, itemFila]);
      },
      onSetStatusOffline: () => {
        current.setStatusApi("offline");
      },
      onRestoreDraft: (texto, anexo) => {
        current.setMessage(texto);
        current.setAttachmentDraft(anexo);
      },
    });
  }

  function registrarLayoutMensagemChat(
    mensagemId: number | null,
    offsetY: number,
  ) {
    const alvo = Number(mensagemId || 0) || null;
    if (!alvo) {
      return;
    }

    if (chatMessageOffsetsRef.current[alvo] === offsetY) {
      return;
    }

    chatMessageOffsetsRef.current[alvo] = offsetY;
    paramsRef.current.setLayoutVersion((estadoAtual) => estadoAtual + 1);
  }

  async function abrirReferenciaNoChat(
    referenciaId: number | null | undefined,
  ) {
    const current = paramsRef.current;
    const alvo = Number(referenciaId || 0) || null;
    if (!alvo) {
      return;
    }

    if (
      !current.conversation?.mensagens.some(
        (item) => Number(item.id || 0) === alvo,
      ) &&
      current.session &&
      current.conversation?.laudoId
    ) {
      await abrirLaudoPorId(
        current.session.accessToken,
        current.conversation.laudoId,
      );
    }

    current.onSetActiveThread("chat");
    current.setHighlightedMessageId(alvo);
  }

  useEffect(() => {
    const current = paramsRef.current;
    if (!current.session) {
      chatDraftKeyRef.current = "";
      chatAttachmentDraftKeyRef.current = "";
      if (current.sessionLoading) {
        return;
      }
      resetChatState();
      current.setUsandoCacheOffline(false);
      return;
    }

    void carregarConversaAtual(current.session.accessToken);
    void carregarListaLaudos(current.session.accessToken);
  }, [params.session, params.sessionLoading]);

  useEffect(() => {
    chatMessageOffsetsRef.current = {};
    paramsRef.current.setLayoutVersion(0);
    paramsRef.current.setHighlightedMessageId(null);
  }, [params.conversation?.laudoId]);

  useEffect(() => {
    paramsRef.current.clearMesaReference();
  }, [params.conversation?.laudoId]);

  useEffect(() => {
    if (params.activeThread !== "chat" || !params.highlightedMessageId) {
      return;
    }

    const offsetY = chatMessageOffsetsRef.current[params.highlightedMessageId];
    if (typeof offsetY !== "number") {
      return;
    }

    const scrollTimeout = setTimeout(() => {
      params.scrollRef.current?.scrollTo({
        y: Math.max(offsetY - 112, 0),
        animated: true,
      });
    }, 120);

    if (chatHighlightTimeoutRef.current) {
      clearTimeout(chatHighlightTimeoutRef.current);
    }
    chatHighlightTimeoutRef.current = setTimeout(() => {
      paramsRef.current.setHighlightedMessageId((estadoAtual) =>
        estadoAtual === params.highlightedMessageId ? null : estadoAtual,
      );
      chatHighlightTimeoutRef.current = null;
    }, 1800);

    return () => clearTimeout(scrollTimeout);
  }, [
    params.activeThread,
    params.conversation?.mensagens.length,
    params.highlightedMessageId,
    params.layoutVersion,
    params.scrollRef,
  ]);

  useEffect(() => {
    return () => {
      if (chatHighlightTimeoutRef.current) {
        clearTimeout(chatHighlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!params.session) {
      return;
    }

    const chatLaudoId = params.conversation?.laudoId ?? null;
    const chatKey = chatLaudoId
      ? params.chaveRascunho("chat", chatLaudoId)
      : "";
    if (chatDraftKeyRef.current !== chatKey) {
      chatDraftKeyRef.current = chatKey;
      params.setMessage("");
      params.setAttachmentDraft(null);
    }
    chatAttachmentDraftKeyRef.current = chatKey;
  }, [
    params.chaveRascunho,
    params.conversation?.laudoId,
    params.session,
    params.setAttachmentDraft,
    params.setMessage,
  ]);

  return {
    actions: {
      abrirLaudoPorId,
      abrirReferenciaNoChat,
      carregarConversaAtual,
      carregarListaLaudos,
      handleAbrirNovoChat,
      handleEnviarMensagem,
      handleReabrir,
      handleSelecionarLaudo,
      registrarLayoutMensagemChat,
      resetChatState,
    },
  };
}
