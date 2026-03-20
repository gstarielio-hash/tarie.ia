import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { ScrollView } from "react-native";

import { carregarMensagensMesaMobile } from "../../config/api";
import type {
  MobileLaudoCard,
  MobileMesaMensagensResponse,
  MobileMesaMessage,
  MobileMesaSendResponse,
} from "../../types/mobile";
import { gateHeavyTransfer } from "../chat/network";
import { sendMesaMessageFlow } from "../chat/messageSendFlows";
import type {
  ActiveThread,
  ChatState,
  ComposerAttachment,
  MessageReferenceState,
} from "../chat/types";
import type { MobileSessionState } from "../session/sessionTypes";

interface MesaCacheState {
  mesaPorLaudo: Record<string, MobileMesaMessage[]>;
  updatedAt: string;
}

interface UseMesaControllerParams<
  TOfflineItem,
  TCacheLeitura extends MesaCacheState,
> {
  session: MobileSessionState | null;
  activeThread: ActiveThread;
  conversation: ChatState | null;
  statusApi: string;
  wifiOnlySync: boolean;
  messageMesa: string;
  attachmentDraft: ComposerAttachment | null;
  activeReference: MessageReferenceState | null;
  messagesMesa: MobileMesaMessage[];
  setMessagesMesa: Dispatch<SetStateAction<MobileMesaMessage[]>>;
  setErrorMesa: Dispatch<SetStateAction<string>>;
  setMessageMesa: Dispatch<SetStateAction<string>>;
  setAttachmentDraft: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setActiveReference: Dispatch<SetStateAction<MessageReferenceState | null>>;
  setLoadingMesa: Dispatch<SetStateAction<boolean>>;
  setSyncMesa: Dispatch<SetStateAction<boolean>>;
  setSendingMesa: Dispatch<SetStateAction<boolean>>;
  laudoMesaCarregado: number | null;
  setLaudoMesaCarregado: Dispatch<SetStateAction<number | null>>;
  scrollRef: MutableRefObject<ScrollView | null>;
  carregarListaLaudosRef: MutableRefObject<
    (accessToken: string, silencioso?: boolean) => Promise<MobileLaudoCard[]>
  >;
  setFilaOffline: Dispatch<SetStateAction<TOfflineItem[]>>;
  setStatusApi: (value: "online" | "offline") => void;
  cacheLeitura: TCacheLeitura;
  setCacheLeitura: Dispatch<SetStateAction<TCacheLeitura>>;
  setUsandoCacheOffline: Dispatch<SetStateAction<boolean>>;
  setConversation: Dispatch<SetStateAction<ChatState | null>>;
  chaveCacheLaudo: (laudoId: number | null) => string;
  chaveRascunho: (thread: ActiveThread, laudoId: number | null) => string;
  erroSugereModoOffline: (error: unknown) => boolean;
  textoFallbackAnexo: (anexo: ComposerAttachment | null) => string;
  criarItemFilaOffline: (params: {
    channel: "mesa";
    laudoId: number;
    text: string;
    title: string;
    attachment: ComposerAttachment | null;
    referenceMessageId: number | null;
  }) => TOfflineItem;
  atualizarResumoLaudoAtual: (
    estadoAtual: ChatState | null,
    payload: MobileMesaMensagensResponse | MobileMesaSendResponse,
  ) => ChatState | null;
}

function resumirTextoMesa(texto: string, fallback: string): string {
  const valor = String(texto || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!valor) {
    return fallback;
  }
  return valor.length > 120 ? `${valor.slice(0, 117)}...` : valor;
}

export function useMesaController<
  TOfflineItem,
  TCacheLeitura extends MesaCacheState,
>(params: UseMesaControllerParams<TOfflineItem, TCacheLeitura>) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const mesaDraftKeyRef = useRef("");
  const mesaAttachmentDraftKeyRef = useRef("");

  function resetMesaState() {
    const current = paramsRef.current;
    current.setMessagesMesa([]);
    current.setErrorMesa("");
    current.setMessageMesa("");
    current.setAttachmentDraft(null);
    current.setActiveReference(null);
    current.setLaudoMesaCarregado(null);
    current.setLoadingMesa(false);
    current.setSyncMesa(false);
    current.setSendingMesa(false);
  }

  function limparReferenciaMesaAtiva() {
    paramsRef.current.setActiveReference(null);
  }

  function definirReferenciaMesaAtiva(mensagemAtual: MobileMesaMessage) {
    const referenciaId = Number(mensagemAtual.id || 0) || null;
    if (!referenciaId) {
      limparReferenciaMesaAtiva();
      return;
    }

    paramsRef.current.setActiveReference({
      id: referenciaId,
      texto: resumirTextoMesa(mensagemAtual.texto, `Mensagem #${referenciaId}`),
    });
  }

  async function carregarMesaAtual(
    accessToken: string,
    laudoId: number,
    silencioso = false,
  ) {
    const current = paramsRef.current;
    if (silencioso) {
      current.setSyncMesa(true);
    } else {
      current.setLoadingMesa(true);
    }
    current.setErrorMesa("");

    try {
      const payload = await carregarMensagensMesaMobile(accessToken, laudoId);
      current.setMessagesMesa(payload.itens || []);
      current.setLaudoMesaCarregado(laudoId);
      current.setUsandoCacheOffline(false);
      current.setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        mesaPorLaudo: {
          ...estadoAtual.mesaPorLaudo,
          [current.chaveCacheLaudo(laudoId)]: payload.itens || [],
        },
        updatedAt: new Date().toISOString(),
      }));
      current.setConversation((estadoAtual) =>
        current.atualizarResumoLaudoAtual(estadoAtual, payload),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel abrir a conversa da mesa.";
      const mesaCache =
        current.cacheLeitura.mesaPorLaudo[current.chaveCacheLaudo(laudoId)] ||
        [];
      const emModoOffline =
        current.statusApi === "offline" || current.erroSugereModoOffline(error);
      if (emModoOffline && mesaCache.length) {
        current.setMessagesMesa(mesaCache);
        current.setLaudoMesaCarregado(laudoId);
        current.setUsandoCacheOffline(true);
        current.setErrorMesa("");
        return;
      }
      current.setErrorMesa(message);
    } finally {
      current.setLoadingMesa(false);
      current.setSyncMesa(false);
    }
  }

  async function handleEnviarMensagemMesa() {
    const current = paramsRef.current;
    const { session, conversation } = current;
    if (!session || !conversation) {
      return;
    }

    const laudoId = conversation.laudoId;
    const referenciaMensagemId =
      Number(current.activeReference?.id || 0) || null;
    const snapshotMesa = current.messagesMesa;
    const gateAnexo = await gateHeavyTransfer({
      wifiOnlySync: current.wifiOnlySync,
      requiresHeavyTransfer: Boolean(current.attachmentDraft),
      blockedMessage:
        "Anexos da mesa foram guardados na fila local e aguardam Wi-Fi para envio.",
    });
    if (current.attachmentDraft && !gateAnexo.allowed && laudoId) {
      current.setFilaOffline((estadoAtual) => [
        ...estadoAtual,
        current.criarItemFilaOffline({
          channel: "mesa",
          laudoId,
          text: current.messageMesa.trim(),
          title: conversation.laudoCard?.titulo || "Mesa avaliadora",
          attachment: current.attachmentDraft,
          referenceMessageId: referenciaMensagemId,
        }),
      ]);
      current.setMessageMesa("");
      current.setAttachmentDraft(null);
      limparReferenciaMesaAtiva();
      current.setErrorMesa(
        gateAnexo.reason ||
          "Resposta guardada localmente para sincronizar depois.",
      );
      return;
    }

    await sendMesaMessageFlow<TOfflineItem>({
      mensagemMesa: current.messageMesa,
      anexoAtual: current.attachmentDraft,
      referenciaMensagemId,
      conversa: {
        laudoId: conversation.laudoId,
        permiteEdicao: conversation.permiteEdicao,
        laudoCard: conversation.laudoCard,
      },
      mensagensMesa: snapshotMesa,
      sessionAccessToken: session.accessToken,
      sessionUserId: session.bootstrap.usuario.id,
      statusApi: current.statusApi,
      carregarListaLaudos: async () => {
        await current.carregarListaLaudosRef.current(session.accessToken, true);
      },
      erroSugereModoOffline: current.erroSugereModoOffline,
      textoFallbackAnexo: current.textoFallbackAnexo,
      criarItemFilaOffline: current.criarItemFilaOffline,
      atualizarResumoLaudoAtual: (resposta) => {
        current.setConversation((estadoAtual) =>
          current.atualizarResumoLaudoAtual(estadoAtual, resposta),
        );
      },
      onSetMensagemMesa: current.setMessageMesa,
      onSetAnexoMesaRascunho: current.setAttachmentDraft,
      onSetErroMesa: current.setErrorMesa,
      onSetEnviandoMesa: current.setSendingMesa,
      onSetMensagensMesa: current.setMessagesMesa,
      onSetMensagensMesaSnapshot: current.setMessagesMesa,
      onQueueOfflineItem: (itemFila) => {
        current.setFilaOffline((estadoAtual) => [...estadoAtual, itemFila]);
      },
      onSetStatusOffline: () => {
        current.setStatusApi("offline");
      },
      onRestoreDraft: (texto, anexo) => {
        current.setMessageMesa(texto);
        current.setAttachmentDraft(anexo);
      },
      onLimparReferenciaMesaAtiva: limparReferenciaMesaAtiva,
      onSetLaudoMesaCarregado: current.setLaudoMesaCarregado,
    });
  }

  useEffect(() => {
    if (!params.session) {
      mesaDraftKeyRef.current = "";
      mesaAttachmentDraftKeyRef.current = "";
      return;
    }

    params.setActiveReference(null);
  }, [params.conversation?.laudoId, params.session, params.setActiveReference]);

  useEffect(() => {
    if (!params.session) {
      return;
    }

    const mesaLaudoId = params.conversation?.laudoId ?? null;
    const mesaKey = mesaLaudoId
      ? params.chaveRascunho("mesa", mesaLaudoId)
      : "";
    if (mesaDraftKeyRef.current !== mesaKey) {
      mesaDraftKeyRef.current = mesaKey;
      params.setMessageMesa("");
      params.setAttachmentDraft(null);
    }
    mesaAttachmentDraftKeyRef.current = mesaKey;
  }, [
    params.chaveRascunho,
    params.conversation?.laudoId,
    params.session,
    params.setAttachmentDraft,
    params.setMessageMesa,
  ]);

  useEffect(() => {
    if (!params.session) {
      return;
    }

    if (!params.conversation?.laudoId) {
      resetMesaState();
      return;
    }

    if (
      params.activeThread === "mesa" &&
      params.laudoMesaCarregado !== params.conversation.laudoId
    ) {
      void carregarMesaAtual(
        params.session.accessToken,
        params.conversation.laudoId,
      );
    }
  }, [
    params.activeThread,
    params.conversation?.laudoId,
    params.laudoMesaCarregado,
    params.session,
  ]);

  useEffect(() => {
    if (!params.session) {
      return;
    }

    const timeout = setTimeout(() => {
      params.scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);

    return () => clearTimeout(timeout);
  }, [
    params.activeThread,
    params.conversation?.mensagens.length,
    params.messagesMesa.length,
    params.scrollRef,
    params.session,
  ]);

  return {
    actions: {
      carregarMesaAtual,
      definirReferenciaMesaAtiva,
      handleEnviarMensagemMesa,
      limparReferenciaMesaAtiva,
      resetMesaState,
    },
  };
}
