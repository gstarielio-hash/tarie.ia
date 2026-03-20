import {
  enviarAnexoMesaMobile,
  enviarMensagemChatMobile,
  enviarMensagemMesaMobile,
  uploadDocumentoChatMobile,
} from "../../config/api";
import { registrarEventoObservabilidade } from "../../config/observability";
import {
  applyChatAiPreferencesToMessage,
  type ChatAiRequestConfig,
} from "./preferences";
import type { ComposerAttachment } from "./types";
import type {
  MobileChatMode,
  MobileChatMessage,
  MobileChatSendResult,
  MobileLaudoCard,
  MobileMesaMessage,
  MobileMesaSendResponse,
} from "../../types/mobile";

interface ConversationSnapshot {
  laudoId: number | null;
  estado: string;
  statusCard: string;
  permiteEdicao: boolean;
  permiteReabrir: boolean;
  laudoCard: MobileLaudoCard | null;
  modo: MobileChatMode | string;
  mensagens: MobileChatMessage[];
}

interface MesaConversationSnapshot {
  laudoId: number | null;
  permiteEdicao: boolean;
  laudoCard?: {
    titulo?: string;
  } | null;
}

interface SendInspectorMessageFlowParams<TOfflineItem> {
  mensagem: string;
  anexoAtual: ComposerAttachment | null;
  snapshotConversa: ConversationSnapshot | null;
  aiRequestConfig: ChatAiRequestConfig;
  sessionAccessToken: string;
  statusApi: string;
  podeEditarConversaNoComposer: (conversa: ConversationSnapshot | null | undefined) => boolean;
  textoFallbackAnexo: (anexo: ComposerAttachment | null) => string;
  normalizarModoChat: (modo: unknown, fallback?: MobileChatMode) => MobileChatMode;
  inferirSetorConversa: (conversa: ConversationSnapshot | null | undefined) => string;
  montarHistoricoParaEnvio: (
    mensagens: MobileChatMessage[],
  ) => Array<{ papel: "usuario" | "assistente"; texto: string }>;
  criarMensagemAssistenteServidor: (resposta: MobileChatSendResult) => MobileChatMessage | null;
  carregarConversaAtual: () => Promise<void>;
  carregarListaLaudos: () => Promise<void>;
  erroSugereModoOffline: (erro: unknown) => boolean;
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
  onSetMensagem: (value: string) => void;
  onSetAnexoRascunho: (value: ComposerAttachment | null) => void;
  onSetErroConversa: (value: string) => void;
  onSetEnviandoMensagem: (value: boolean) => void;
  onApplyOptimisticMessage: (mensagem: MobileChatMessage, modoAtivo: MobileChatMode) => void;
  onApplyAssistantResponse: (resposta: MobileChatSendResult, assistente: MobileChatMessage | null) => void;
  onReverterConversa: () => void;
  onQueueOfflineItem: (item: TOfflineItem) => void;
  onSetStatusOffline: () => void;
  onRestoreDraft: (texto: string, anexo: ComposerAttachment | null) => void;
}

interface SendMesaMessageFlowParams<TOfflineItem> {
  mensagemMesa: string;
  anexoAtual: ComposerAttachment | null;
  referenciaMensagemId: number | null;
  conversa: MesaConversationSnapshot;
  mensagensMesa: MobileMesaMessage[];
  sessionAccessToken: string;
  sessionUserId: number | null;
  statusApi: string;
  carregarListaLaudos: () => Promise<void>;
  erroSugereModoOffline: (erro: unknown) => boolean;
  textoFallbackAnexo: (anexo: ComposerAttachment | null) => string;
  criarItemFilaOffline: (params: {
    channel: "mesa";
    laudoId: number;
    text: string;
    title: string;
    attachment: ComposerAttachment | null;
    referenceMessageId: number | null;
  }) => TOfflineItem;
  atualizarResumoLaudoAtual: (resposta: MobileMesaSendResponse) => void;
  onSetMensagemMesa: (value: string) => void;
  onSetAnexoMesaRascunho: (value: ComposerAttachment | null) => void;
  onSetErroMesa: (value: string) => void;
  onSetEnviandoMesa: (value: boolean) => void;
  onSetMensagensMesa: (updater: (estadoAtual: MobileMesaMessage[]) => MobileMesaMessage[]) => void;
  onSetMensagensMesaSnapshot: (snapshot: MobileMesaMessage[]) => void;
  onQueueOfflineItem: (item: TOfflineItem) => void;
  onSetStatusOffline: () => void;
  onRestoreDraft: (texto: string, anexo: ComposerAttachment | null) => void;
  onLimparReferenciaMesaAtiva: () => void;
  onSetLaudoMesaCarregado: (laudoId: number) => void;
}

export async function sendInspectorMessageFlow<TOfflineItem>({
  mensagem,
  anexoAtual,
  snapshotConversa,
  aiRequestConfig,
  sessionAccessToken,
  statusApi,
  podeEditarConversaNoComposer,
  textoFallbackAnexo,
  normalizarModoChat,
  inferirSetorConversa,
  montarHistoricoParaEnvio,
  criarMensagemAssistenteServidor,
  carregarConversaAtual,
  carregarListaLaudos,
  erroSugereModoOffline,
  criarItemFilaOffline,
  onSetMensagem,
  onSetAnexoRascunho,
  onSetErroConversa,
  onSetEnviandoMensagem,
  onApplyOptimisticMessage,
  onApplyAssistantResponse,
  onReverterConversa,
  onQueueOfflineItem,
  onSetStatusOffline,
  onRestoreDraft,
}: SendInspectorMessageFlowParams<TOfflineItem>) {
  const texto = mensagem.trim();
  if (!texto && !anexoAtual) {
    return;
  }

  if (!podeEditarConversaNoComposer(snapshotConversa)) {
    onSetErroConversa("Laudo em modo leitura. Reabra para enviar nova mensagem.");
    return;
  }

  const textoExibicao = texto || textoFallbackAnexo(anexoAtual);
  const modoAtivo = aiRequestConfig.mode;
  const setorAtivo = inferirSetorConversa(snapshotConversa);

  const mensagemOtimista: MobileChatMessage = {
    id: Date.now(),
    papel: "usuario",
    texto: textoExibicao,
    tipo: "user",
    modo: modoAtivo,
    anexos: anexoAtual ? [{ label: anexoAtual.label, categoria: anexoAtual.kind }] : undefined,
  };

  onSetMensagem("");
  onSetAnexoRascunho(null);
  onSetErroConversa("");
  onSetEnviandoMensagem(true);
  onApplyOptimisticMessage(mensagemOtimista, modoAtivo);

  try {
    let dadosImagem = "";
    let textoDocumento = "";
    let nomeDocumento = "";

    if (anexoAtual?.kind === "image") {
      dadosImagem = anexoAtual.dadosImagem;
    } else if (anexoAtual?.kind === "document") {
      if (anexoAtual.textoDocumento) {
        textoDocumento = anexoAtual.textoDocumento;
        nomeDocumento = anexoAtual.nomeDocumento;
      } else {
        const documento = await uploadDocumentoChatMobile(sessionAccessToken, {
          uri: anexoAtual.fileUri,
          nome: anexoAtual.nomeDocumento,
          mimeType: anexoAtual.mimeType,
        });
        textoDocumento = documento.texto;
        nomeDocumento = documento.nome;
      }
    }

    const respostaChat = await enviarMensagemChatMobile(sessionAccessToken, {
      mensagem: applyChatAiPreferencesToMessage(texto, aiRequestConfig),
      dadosImagem,
      setor: setorAtivo,
      textoDocumento,
      nomeDocumento,
      laudoId: snapshotConversa?.laudoId ?? null,
      modo: modoAtivo,
      historico: montarHistoricoParaEnvio([...(snapshotConversa?.mensagens || []), mensagemOtimista]),
    });

    const mensagemAssistenteServidor = criarMensagemAssistenteServidor(respostaChat);
    onApplyAssistantResponse(respostaChat, mensagemAssistenteServidor);
    await carregarConversaAtual();
    await carregarListaLaudos();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível enviar a mensagem do inspetor.";
    const podeEnfileirar = Boolean(
      (texto.trim() || anexoAtual) && (statusApi === "offline" || erroSugereModoOffline(error)),
    );

    onReverterConversa();
    if (podeEnfileirar) {
      const itemFila = criarItemFilaOffline({
        channel: "chat",
        laudoId: snapshotConversa?.laudoId ?? null,
        text: texto,
        title: snapshotConversa?.laudoCard?.titulo || "Nova inspeção",
        attachment: anexoAtual,
        aiMode: modoAtivo,
        aiSummary: aiRequestConfig.summaryLabel,
        aiMessagePrefix: aiRequestConfig.messagePrefix,
      });
      onQueueOfflineItem(itemFila);
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_enqueue",
        ok: true,
        count: 1,
        detail: "chat",
      });
      onSetErroConversa("Sem conexão estável. O envio foi guardado na fila local.");
      onSetStatusOffline();
    } else {
      onRestoreDraft(texto, anexoAtual);
      onSetErroConversa(message);
    }
  } finally {
    onSetEnviandoMensagem(false);
  }
}

export async function sendMesaMessageFlow<TOfflineItem>({
  mensagemMesa,
  anexoAtual,
  referenciaMensagemId,
  conversa,
  mensagensMesa,
  sessionAccessToken,
  sessionUserId,
  statusApi,
  carregarListaLaudos,
  erroSugereModoOffline,
  textoFallbackAnexo,
  criarItemFilaOffline,
  atualizarResumoLaudoAtual,
  onSetMensagemMesa,
  onSetAnexoMesaRascunho,
  onSetErroMesa,
  onSetEnviandoMesa,
  onSetMensagensMesa,
  onSetMensagensMesaSnapshot,
  onQueueOfflineItem,
  onSetStatusOffline,
  onRestoreDraft,
  onLimparReferenciaMesaAtiva,
  onSetLaudoMesaCarregado,
}: SendMesaMessageFlowParams<TOfflineItem>) {
  const texto = mensagemMesa.trim();

  if ((!texto && !anexoAtual) || !conversa.laudoId || !conversa.permiteEdicao) {
    return;
  }

  const textoExibicao = texto || textoFallbackAnexo(anexoAtual);
  const mensagemOtimista: MobileMesaMessage = {
    id: Date.now(),
    laudo_id: conversa.laudoId,
    tipo: "humano_insp",
    texto: textoExibicao,
    remetente_id: sessionUserId,
    data: "Agora",
    lida: true,
    resolvida_em: "",
    resolvida_em_label: "",
    resolvida_por_nome: "",
    referencia_mensagem_id: referenciaMensagemId || undefined,
    anexos: anexoAtual ? [{ label: anexoAtual.label, categoria: anexoAtual.kind }] : undefined,
  };

  onSetMensagemMesa("");
  onSetAnexoMesaRascunho(null);
  onSetErroMesa("");
  onSetEnviandoMesa(true);
  onSetMensagensMesa((estadoAtual) => [...estadoAtual, mensagemOtimista]);

  try {
    const resposta = anexoAtual
      ? await enviarAnexoMesaMobile(sessionAccessToken, conversa.laudoId, {
          uri: anexoAtual.fileUri,
          nome: anexoAtual.kind === "document" ? anexoAtual.nomeDocumento : anexoAtual.label,
          mimeType: anexoAtual.mimeType,
          texto,
          referenciaMensagemId,
        })
      : await enviarMensagemMesaMobile(
          sessionAccessToken,
          conversa.laudoId,
          texto,
          referenciaMensagemId,
        );

    onSetMensagensMesa((estadoAtual) => {
      const semOtimista = estadoAtual.filter((item) => item.id !== mensagemOtimista.id);
      return [...semOtimista, resposta.mensagem];
    });

    atualizarResumoLaudoAtual(resposta);
    onLimparReferenciaMesaAtiva();
    onSetLaudoMesaCarregado(conversa.laudoId);
    await carregarListaLaudos();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível responder à mesa.";
    const podeEnfileirar = Boolean(
      (texto.trim() || anexoAtual) && (statusApi === "offline" || erroSugereModoOffline(error)),
    );

    onSetMensagensMesaSnapshot(mensagensMesa);
    if (podeEnfileirar) {
      const itemFila = criarItemFilaOffline({
        channel: "mesa",
        laudoId: conversa.laudoId,
        text: texto,
        title: conversa.laudoCard?.titulo || `Laudo #${conversa.laudoId}`,
        attachment: anexoAtual,
        referenceMessageId: referenciaMensagemId,
      });
      onQueueOfflineItem(itemFila);
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_enqueue",
        ok: true,
        count: 1,
        detail: "mesa",
      });
      onSetErroMesa("Sem conexão estável. O envio para a mesa ficou guardado na fila local.");
      onSetStatusOffline();
    } else {
      onRestoreDraft(texto, anexoAtual);
      onSetErroMesa(message);
    }
  } finally {
    onSetEnviandoMesa(false);
  }
}
