import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import {
  enviarAnexoMesaMobile,
  enviarMensagemChatMobile,
  enviarMensagemMesaMobile,
  uploadDocumentoChatMobile,
} from "../../config/api";
import { registrarEventoObservabilidade } from "../../config/observability";
import type {
  MobileChatMessage,
  MobileChatMode,
  MobileLaudoCard,
  MobileMesaMessage,
} from "../../types/mobile";
import { canSyncOnCurrentNetwork } from "../chat/network";
import type {
  ActiveThread,
  ComposerAttachment,
  MessageReferenceState,
} from "../chat/types";
import type { MobileSessionState } from "../session/sessionTypes";

interface ConversationLike {
  laudoId: number | null;
  modo: MobileChatMode | string;
  mensagens: MobileChatMessage[];
  laudoCard: MobileLaudoCard | null;
}

interface OfflineItemLike {
  id: string;
  channel: ActiveThread;
  laudoId: number | null;
  text: string;
  title: string;
  attachment: ComposerAttachment | null;
  referenceMessageId: number | null;
  attempts: number;
  lastAttemptAt: string;
  lastError: string;
  nextRetryAt: string;
  aiMode: MobileChatMode;
  aiMessagePrefix: string;
}

interface UseOfflineQueueControllerParams<
  TConversation extends ConversationLike,
  TOfflineItem extends OfflineItemLike,
> {
  session: MobileSessionState | null;
  sessionLoading: boolean;
  statusApi: string;
  wifiOnlySync: boolean;
  syncEnabled: boolean;
  activeThread: ActiveThread;
  conversation: TConversation | null;
  messagesMesa: MobileMesaMessage[];
  offlineQueue: TOfflineItem[];
  syncingQueue: boolean;
  syncingItemId: string;
  setOfflineQueue: Dispatch<SetStateAction<TOfflineItem[]>>;
  setSyncingQueue: Dispatch<SetStateAction<boolean>>;
  setSyncingItemId: Dispatch<SetStateAction<string>>;
  setOfflineQueueVisible: Dispatch<SetStateAction<boolean>>;
  setActiveThread: Dispatch<SetStateAction<ActiveThread>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setAttachmentDraft: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setMessageMesa: Dispatch<SetStateAction<string>>;
  setAttachmentMesaDraft: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setMesaActiveReference: Dispatch<
    SetStateAction<MessageReferenceState | null>
  >;
  setErrorConversation: Dispatch<SetStateAction<string>>;
  setErrorMesa: Dispatch<SetStateAction<string>>;
  setStatusApi: (value: "online" | "offline") => void;
  saveQueueLocally: (fila: TOfflineItem[]) => Promise<void>;
  carregarListaLaudos: (
    accessToken: string,
    silencioso?: boolean,
  ) => Promise<MobileLaudoCard[]>;
  carregarConversaAtual: (
    accessToken: string,
    silencioso?: boolean,
  ) => Promise<TConversation | null>;
  abrirLaudoPorId: (accessToken: string, laudoId: number) => Promise<void>;
  handleSelecionarLaudo: (card: MobileLaudoCard | null) => Promise<void>;
  carregarMesaAtual: (
    accessToken: string,
    laudoId: number,
    silencioso?: boolean,
  ) => Promise<void>;
  inferirSetorConversa: (conversa: TConversation | null | undefined) => string;
  montarHistoricoParaEnvio: (
    mensagens: MobileChatMessage[],
  ) => Array<{ papel: "usuario" | "assistente"; texto: string }>;
  normalizarModoChat: (
    modo: unknown,
    fallback?: MobileChatMode,
  ) => MobileChatMode;
  obterResumoReferenciaMensagem: (
    referenciaId: number | null | undefined,
    mensagensChat: MobileChatMessage[],
    mensagensMesa: MobileMesaMessage[],
  ) => string;
  erroSugereModoOffline: (erro: unknown) => boolean;
  duplicarComposerAttachment: (
    anexo: ComposerAttachment | null,
  ) => ComposerAttachment | null;
  calcularBackoffMs: (tentativas: number) => number;
  isItemReadyForRetry: (item: TOfflineItem, referencia?: number) => boolean;
}

export function useOfflineQueueController<
  TConversation extends ConversationLike,
  TOfflineItem extends OfflineItemLike,
>(params: UseOfflineQueueControllerParams<TConversation, TOfflineItem>) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  function removerItemFilaOffline(id: string) {
    paramsRef.current.setOfflineQueue((estadoAtual) =>
      estadoAtual.filter((item) => item.id !== id),
    );
  }

  function atualizarItemFilaOffline(
    id: string,
    atualizacao: Partial<
      Pick<
        TOfflineItem,
        "attempts" | "lastAttemptAt" | "lastError" | "nextRetryAt"
      >
    >,
  ) {
    paramsRef.current.setOfflineQueue((estadoAtual) =>
      estadoAtual.map((item) =>
        item.id === id
          ? {
              ...item,
              ...atualizacao,
            }
          : item,
      ),
    );
  }

  async function enviarPendenciaOffline(
    accessToken: string,
    item: TOfflineItem,
    laudoSequencial: number | null,
  ): Promise<number | null> {
    const current = paramsRef.current;
    if (item.channel === "mesa") {
      if (!item.laudoId) {
        return laudoSequencial;
      }

      if (item.attachment) {
        await enviarAnexoMesaMobile(accessToken, item.laudoId, {
          uri: item.attachment.fileUri,
          nome:
            item.attachment.kind === "document"
              ? item.attachment.nomeDocumento
              : item.attachment.label,
          mimeType: item.attachment.mimeType,
          texto: item.text,
          referenciaMensagemId: item.referenceMessageId,
        });
      } else {
        await enviarMensagemMesaMobile(
          accessToken,
          item.laudoId,
          item.text,
          item.referenceMessageId,
        );
      }
      return laudoSequencial;
    }

    const laudoIdAtual = item.laudoId ?? laudoSequencial;
    let dadosImagem = "";
    let textoDocumento = "";
    let nomeDocumento = "";

    if (item.attachment?.kind === "image") {
      dadosImagem = item.attachment.dadosImagem;
    } else if (item.attachment?.kind === "document") {
      if (item.attachment.textoDocumento) {
        textoDocumento = item.attachment.textoDocumento;
        nomeDocumento = item.attachment.nomeDocumento;
      } else {
        const documento = await uploadDocumentoChatMobile(accessToken, {
          uri: item.attachment.fileUri,
          nome: item.attachment.nomeDocumento,
          mimeType: item.attachment.mimeType,
        });
        textoDocumento = documento.texto;
        nomeDocumento = documento.nome;
      }
    }

    const conversaAtual = current.conversation;
    const resposta = await enviarMensagemChatMobile(accessToken, {
      mensagem: item.aiMessagePrefix
        ? `${item.aiMessagePrefix}\n\n${item.text}`.trim()
        : item.text,
      dadosImagem,
      setor:
        conversaAtual?.laudoId && conversaAtual.laudoId === laudoIdAtual
          ? current.inferirSetorConversa(conversaAtual)
          : "geral",
      textoDocumento,
      nomeDocumento,
      laudoId: laudoIdAtual,
      modo: current.normalizarModoChat(item.aiMode || conversaAtual?.modo),
      historico:
        conversaAtual?.laudoId && conversaAtual.laudoId === laudoIdAtual
          ? current.montarHistoricoParaEnvio(conversaAtual.mensagens)
          : [],
    });
    return resposta.laudoId ?? laudoSequencial;
  }

  async function handleRetomarItemFilaOffline(item: TOfflineItem) {
    const current = paramsRef.current;
    if (!current.session) {
      return;
    }

    try {
      current.setOfflineQueueVisible(false);
      current.setErrorConversation("");
      current.setErrorMesa("");

      if (item.channel === "chat") {
        current.setActiveThread("chat");
        if (item.laudoId) {
          await current.abrirLaudoPorId(
            current.session.accessToken,
            item.laudoId,
          );
        } else {
          await current.handleSelecionarLaudo(null);
        }
        current.setMessage(item.text);
        current.setAttachmentDraft(
          current.duplicarComposerAttachment(item.attachment),
        );
      } else {
        if (!item.laudoId) {
          removerItemFilaOffline(item.id);
          return;
        }
        await current.abrirLaudoPorId(
          current.session.accessToken,
          item.laudoId,
        );
        current.setActiveThread("mesa");
        await current.carregarMesaAtual(
          current.session.accessToken,
          item.laudoId,
          true,
        );
        current.setMessageMesa(item.text);
        current.setAttachmentMesaDraft(
          current.duplicarComposerAttachment(item.attachment),
        );
        if (item.referenceMessageId) {
          current.setMesaActiveReference({
            id: item.referenceMessageId,
            texto: current.obterResumoReferenciaMensagem(
              item.referenceMessageId,
              current.conversation?.mensagens || [],
              current.messagesMesa,
            ),
          });
        }
      }

      removerItemFilaOffline(item.id);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível retomar essa pendência local.";
      if (item.channel === "mesa") {
        current.setErrorMesa(message);
      } else {
        current.setErrorConversation(message);
      }
    }
  }

  async function sincronizarItemFilaOffline(item: TOfflineItem) {
    const current = paramsRef.current;
    if (!current.session || current.syncingQueue || current.syncingItemId) {
      return;
    }
    if (!(await canSyncOnCurrentNetwork(current.wifiOnlySync))) {
      const mensagem =
        "Ative Wi-Fi para sincronizar a fila offline neste dispositivo.";
      current.setErrorConversation(mensagem);
      current.setErrorMesa(mensagem);
      return;
    }
    if (!current.syncEnabled) {
      const mensagem =
        "Ative a sincronização entre dispositivos para reenviar itens da fila offline.";
      current.setErrorConversation(mensagem);
      current.setErrorMesa(mensagem);
      return;
    }

    current.setErrorConversation("");
    current.setErrorMesa("");
    current.setSyncingItemId(item.id);
    const tentativaEm = new Date().toISOString();
    const proximaTentativa = item.attempts + 1;
    atualizarItemFilaOffline(item.id, {
      attempts: proximaTentativa,
      lastAttemptAt: tentativaEm,
      lastError: "",
      nextRetryAt: "",
    });

    try {
      const laudoResultado = await enviarPendenciaOffline(
        current.session.accessToken,
        item,
        null,
      );
      removerItemFilaOffline(item.id);
      await current.carregarListaLaudos(current.session.accessToken, true);
      const proximaConversa = await current.carregarConversaAtual(
        current.session.accessToken,
        true,
      );
      const laudoAtual =
        item.laudoId ?? laudoResultado ?? proximaConversa?.laudoId ?? null;
      if (
        (item.channel === "mesa" || current.activeThread === "mesa") &&
        laudoAtual
      ) {
        await current.carregarMesaAtual(
          current.session.accessToken,
          laudoAtual,
          true,
        );
      }
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_item_sync",
        ok: true,
        count: 1,
        detail: `${item.channel}_attempt_${proximaTentativa}`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível reenviar essa pendência.";
      const proximaTentativaEm = new Date(
        Date.now() + current.calcularBackoffMs(proximaTentativa),
      ).toISOString();
      atualizarItemFilaOffline(item.id, {
        attempts: proximaTentativa,
        lastAttemptAt: tentativaEm,
        lastError: message,
        nextRetryAt: proximaTentativaEm,
      });
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_item_sync",
        ok: false,
        count: 1,
        detail: message,
      });
      if (current.erroSugereModoOffline(error)) {
        current.setStatusApi("offline");
      }
      if (item.channel === "mesa") {
        current.setErrorMesa(message);
      } else {
        current.setErrorConversation(message);
      }
    } finally {
      current.setSyncingItemId("");
    }
  }

  async function sincronizarFilaOffline(
    accessToken: string,
    silencioso = false,
  ) {
    const current = paramsRef.current;
    if (!current.offlineQueue.length || current.syncingQueue) {
      return;
    }
    if (!(await canSyncOnCurrentNetwork(current.wifiOnlySync))) {
      if (!silencioso) {
        const mensagem =
          "A fila offline só sincroniza em Wi-Fi porque esse controle está ativo.";
        current.setErrorConversation(mensagem);
        current.setErrorMesa(mensagem);
      }
      return;
    }
    if (!current.syncEnabled) {
      if (!silencioso) {
        const mensagem =
          "Sincronização entre dispositivos desativada. Ative essa opção para enviar a fila offline.";
        current.setErrorConversation(mensagem);
        current.setErrorMesa(mensagem);
      }
      return;
    }

    if (!silencioso) {
      current.setErrorConversation("");
      current.setErrorMesa("");
    }
    current.setSyncingQueue(true);

    let restante = [...current.offlineQueue];
    let laudoSequencial: number | null = null;
    const referencia = Date.now();
    let itensTentados = 0;
    let itensSincronizados = 0;

    try {
      for (const item of [...restante]) {
        if (item.channel === "mesa" && !item.laudoId) {
          removerItemFilaOffline(item.id);
          restante = restante.filter((registro) => registro.id !== item.id);
          continue;
        }

        if (!current.isItemReadyForRetry(item, referencia)) {
          continue;
        }
        itensTentados += 1;

        const tentativaEm = new Date().toISOString();
        const proximaTentativa = item.attempts + 1;
        atualizarItemFilaOffline(item.id, {
          attempts: proximaTentativa,
          lastAttemptAt: tentativaEm,
          lastError: "",
          nextRetryAt: "",
        });

        try {
          laudoSequencial = await enviarPendenciaOffline(
            accessToken,
            item,
            laudoSequencial,
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Não foi possível sincronizar a fila local.";
          const proximaTentativaEm = new Date(
            Date.now() + current.calcularBackoffMs(proximaTentativa),
          ).toISOString();
          atualizarItemFilaOffline(item.id, {
            attempts: proximaTentativa,
            lastAttemptAt: tentativaEm,
            lastError: message,
            nextRetryAt: proximaTentativaEm,
          });
          throw error;
        }

        removerItemFilaOffline(item.id);
        restante = restante.filter((registro) => registro.id !== item.id);
        itensSincronizados += 1;
      }

      await current.carregarListaLaudos(accessToken, true);
      const proximaConversa = await current.carregarConversaAtual(
        accessToken,
        true,
      );
      const laudoAtual = proximaConversa?.laudoId ?? laudoSequencial ?? null;
      if (current.activeThread === "mesa" && laudoAtual) {
        await current.carregarMesaAtual(accessToken, laudoAtual, true);
      }
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_sync",
        ok: true,
        count: itensSincronizados,
        detail: `${itensSincronizados}/${itensTentados}`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível sincronizar a fila local.";
      current.setErrorConversation(message);
      current.setErrorMesa(message);
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_sync",
        ok: false,
        count: itensSincronizados,
        detail: message,
      });
      if (current.erroSugereModoOffline(error)) {
        current.setStatusApi("offline");
      }
    } finally {
      current.setSyncingQueue(false);
    }
  }

  useEffect(() => {
    if (params.session) {
      return;
    }
    params.setSyncingQueue(false);
    params.setSyncingItemId("");
  }, [params.session, params.setSyncingItemId, params.setSyncingQueue]);

  useEffect(() => {
    if (params.sessionLoading) {
      return;
    }
    void params.saveQueueLocally(params.offlineQueue);
  }, [params.offlineQueue, params.saveQueueLocally, params.sessionLoading]);

  useEffect(() => {
    if (
      !params.session ||
      params.statusApi !== "online" ||
      !params.offlineQueue.length ||
      params.syncingQueue ||
      !params.syncEnabled
    ) {
      return;
    }

    if (!params.offlineQueue.some((item) => params.isItemReadyForRetry(item))) {
      return;
    }

    void sincronizarFilaOffline(params.session.accessToken, true);
  }, [
    params.offlineQueue,
    params.session,
    params.statusApi,
    params.syncEnabled,
    params.syncingQueue,
  ]);

  useEffect(() => {
    if (
      !params.session ||
      params.statusApi !== "online" ||
      params.syncingQueue ||
      !params.offlineQueue.length ||
      !params.syncEnabled
    ) {
      return;
    }

    const proximaPendente = params.offlineQueue
      .map((item) => {
        const proximaTentativa = item.nextRetryAt
          ? new Date(item.nextRetryAt).getTime()
          : Number.NaN;
        return {
          id: item.id,
          timestamp: proximaTentativa,
        };
      })
      .filter(
        (item) => !Number.isNaN(item.timestamp) && item.timestamp > Date.now(),
      )
      .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (!proximaPendente) {
      return;
    }

    const esperaMs = Math.max(500, proximaPendente.timestamp - Date.now());
    const timeout = setTimeout(() => {
      void sincronizarFilaOffline(params.session!.accessToken, true);
    }, esperaMs);

    return () => clearTimeout(timeout);
  }, [
    params.offlineQueue,
    params.session,
    params.statusApi,
    params.syncEnabled,
    params.syncingQueue,
  ]);

  return {
    actions: {
      atualizarItemFilaOffline,
      handleRetomarItemFilaOffline,
      removerItemFilaOffline,
      sincronizarFilaOffline,
      sincronizarItemFilaOffline,
    },
  };
}
