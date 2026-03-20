import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  TextInput,
  useColorScheme,
} from "react-native";

import { API_BASE_URL, pingApi } from "../config/api";
import { configureObservability } from "../config/observability";
import { configureCrashReports } from "../config/crashReports";
import type {
  MobileAttachment,
  MobileBootstrapResponse,
  MobileChatMessage,
  MobileChatMode,
  MobileChatSendResult,
  MobileEstadoLaudo,
  MobileLaudoCard,
  MobileLaudoMensagensResponse,
  MobileLaudoStatusResponse,
  MobileMesaMessage,
} from "../types/mobile";
import {
  ACCENT_OPTIONS,
  AI_MODEL_OPTIONS,
  APP_BUILD_CHANNEL,
  APP_LANGUAGE_OPTIONS,
  BATTERY_OPTIONS,
  CONVERSATION_TONE_OPTIONS,
  DATA_RETENTION_OPTIONS,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  HISTORY_UI_STATE_FILE,
  HISTORY_DRAWER_FILTERS,
  LOCK_TIMEOUT_OPTIONS,
  MAX_NOTIFICATIONS,
  NOTIFICATIONS_FILE,
  NOTIFICATION_SOUND_OPTIONS,
  OFFLINE_QUEUE_FILE,
  READ_CACHE_FILE,
  REGION_OPTIONS,
  RESPONSE_LANGUAGE_OPTIONS,
  RESPONSE_STYLE_OPTIONS,
  SETTINGS_DRAWER_FILTERS,
  THEME_OPTIONS,
} from "./InspectorMobileApp.constants";
import { useActivityCenterController } from "./activity/useActivityCenterController";
import { buildLoginScreenProps } from "./auth/buildLoginScreenProps";
import { LoginScreen } from "./auth/LoginScreen";
import { useExternalAccessActions } from "./auth/useExternalAccessActions";
import { buildAttachmentHandlingPolicy } from "./chat/attachments";
import { buildThreadContextState } from "./chat/buildThreadContextState";
import { nomeExibicaoAnexo } from "./chat/attachmentUtils";
import {
  buildChatAiRequestConfig,
  describeChatAiBehaviorChange,
} from "./chat/preferences";
import { canSyncOnCurrentNetwork } from "./chat/network";
import { useAttachmentController } from "./chat/useAttachmentController";
import { useVoiceInputController } from "./chat/useVoiceInputController";
import {
  buildVoiceInputUnavailableMessage,
  loadVoiceRuntimeState,
} from "./chat/voice";
import { useInspectorChatController } from "./chat/useInspectorChatController";
import type {
  ActiveThread,
  ChatState,
  ComposerAttachment,
  MessageReferenceState,
  MobileActivityNotification,
  OfflinePendingMessage,
} from "./chat/types";
import { buildAuthenticatedLayoutInput } from "./common/buildAuthenticatedLayoutInput";
import { buildAuthenticatedLayoutProps } from "./common/buildAuthenticatedLayoutProps";
import { buildInspectorBaseDerivedState } from "./common/buildInspectorBaseDerivedState";
import { buildInspectorBaseDerivedStateInput } from "./common/buildInspectorBaseDerivedStateInput";
import { buildInspectorSessionModalsInput } from "./common/buildInspectorSessionModalsInput";
import { buildInspectorSessionModalsStackProps } from "./common/buildInspectorSessionModalsStackProps";
import type { MobileReadCache } from "./common/readCacheTypes";
import { buildRefreshAction } from "./common/buildRefreshAction";
import { useSidePanelsController } from "./common/useSidePanelsController";
import { useHistoryController } from "./history/useHistoryController";
import { useMesaController } from "./mesa/useMesaController";
import { useOfflineQueueController } from "./offline/useOfflineQueueController";
import { useAppLockController } from "./security/useAppLockController";
import { useSecurityEventLog } from "./security/useSecurityEventLog";
import {
  atualizarPerfilContaNoBackend,
  atualizarSenhaContaNoBackend,
  enviarFotoPerfilNoBackend,
  enviarRelatoSuporteNoBackend,
} from "./settings/settingsBackend";
import { buildAccountDeletionAction } from "./settings/buildAccountDeletionAction";
import { buildSettingsConfirmAndExportActions } from "./settings/buildSettingsConfirmAndExportActions";
import { buildInspectorSettingsDrawerInput } from "./settings/buildInspectorSettingsDrawerInput";
import { buildInspectorSettingsDrawerPanelProps } from "./settings/buildInspectorSettingsDrawerPanelProps";
import { buildSettingsSheetBodyRenderer } from "./settings/buildSettingsSheetBodyRenderer";
import { buildSettingsSheetConfirmAction } from "./settings/buildSettingsSheetConfirmAction";
import {
  formatarStatusReautenticacao,
  reautenticacaoAindaValida,
} from "./settings/reauth";
import { useSettingsEntryActions } from "./settings/useSettingsEntryActions";
import { useSettingsNavigation } from "./settings/useSettingsNavigation";
import { useSettingsOperationsActions } from "./settings/useSettingsOperationsActions";
import { useSettingsPresentation } from "./settings/useSettingsPresentation";
import { useSettingsReauthActions } from "./settings/useSettingsReauthActions";
import { useSettingsSecurityActions } from "./settings/useSettingsSecurityActions";
import { useSettingsToggleActions } from "./settings/useSettingsToggleActions";
import { useCriticalSettingsSync } from "./settings/useCriticalSettingsSync";
import { getInstalledAppRuntimeInfo } from "./system/runtime";
import { InspectorAuthenticatedLayout } from "./InspectorAuthenticatedLayout";
import {
  mergeCriticalSnapshotIntoSettings,
  mergeMobileUserIntoSettings,
  settingsToCriticalSnapshot,
  useSettingsStore,
} from "../settings";
import { useInspectorSession } from "./session/useInspectorSession";
type OfflineQueueFilter = "all" | "chat" | "mesa";
type HistoryDrawerFilter = (typeof HISTORY_DRAWER_FILTERS)[number]["key"];
type ThreadContextChipTone = "accent" | "success" | "danger" | "muted";

interface ThreadContextChipItem {
  key: string;
  label: string;
  tone: ThreadContextChipTone;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

interface AttachmentPreviewState {
  titulo: string;
  uri: string;
}

type SettingsDrawerFilter = (typeof SETTINGS_DRAWER_FILTERS)[number]["key"];

interface LocalHistoryUiState {
  laudosFixadosIds: number[];
  historicoOcultoIds: number[];
}

const CACHE_LEITURA_VAZIO: MobileReadCache = {
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

interface HistorySection {
  key: string;
  title: string;
  items: MobileLaudoCard[];
}

const historySectionOrder = ["today", "yesterday", "week", "older"] as const;

function filtrarThreadContextChips(
  items: Array<ThreadContextChipItem | null>,
): ThreadContextChipItem[] {
  return items.filter((item): item is ThreadContextChipItem => item !== null);
}

function startOfDay(date: Date): number {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone.getTime();
}

function getHistorySectionKey(
  dataIso: string,
  referencia = new Date(),
): (typeof historySectionOrder)[number] {
  const alvo = new Date(dataIso);
  if (Number.isNaN(alvo.getTime())) {
    return "older";
  }

  const diffDays = Math.floor(
    (startOfDay(referencia) - startOfDay(alvo)) / 86_400_000,
  );

  if (diffDays <= 0) {
    return "today";
  }
  if (diffDays === 1) {
    return "yesterday";
  }
  if (diffDays < 7) {
    return "week";
  }
  return "older";
}

function getHistorySectionLabel(
  key: (typeof historySectionOrder)[number],
): string {
  switch (key) {
    case "today":
      return "Hoje";
    case "yesterday":
      return "Ontem";
    case "week":
      return "Esta semana";
    default:
      return "Mais antigos";
  }
}

function buildHistorySections(items: MobileLaudoCard[]): HistorySection[] {
  const fixados = items.filter((item) => item.pinado);
  const restantes = items.filter((item) => !item.pinado);
  const buckets = new Map<
    (typeof historySectionOrder)[number],
    MobileLaudoCard[]
  >();
  for (const item of restantes) {
    const key = getHistorySectionKey(item.data_iso);
    const current = buckets.get(key) || [];
    current.push(item);
    buckets.set(key, current);
  }

  const secoesCronologicas = historySectionOrder
    .map((key) => ({
      key,
      title: getHistorySectionLabel(key),
      items: buckets.get(key) || [],
    }))
    .filter((section) => section.items.length > 0);

  return fixados.length
    ? [
        { key: "pinned", title: "Fixadas", items: fixados },
        ...secoesCronologicas,
      ]
    : secoesCronologicas;
}

function aplicarPreferenciasLaudos(
  itens: MobileLaudoCard[],
  fixadosIds: number[],
  ocultosIds: number[],
): MobileLaudoCard[] {
  const ocultos = new Set(ocultosIds);
  const fixados = new Set(fixadosIds);

  return itens
    .filter((item) => !ocultos.has(item.id))
    .map((item) => ({
      ...item,
      pinado: fixados.has(item.id),
    }));
}

function atualizarResumoLaudoAtual<
  T extends {
    estado: MobileEstadoLaudo | string;
    permite_edicao: boolean;
    permite_reabrir: boolean;
    laudo_card: MobileLaudoCard | null;
    modo?: MobileChatMode | string;
  },
>(estadoAtual: ChatState | null, payload: T): ChatState | null {
  if (!estadoAtual) {
    return estadoAtual;
  }

  return {
    ...estadoAtual,
    estado: payload.estado,
    statusCard: payload.laudo_card?.status_card || estadoAtual.statusCard,
    permiteEdicao: Boolean(payload.permite_edicao),
    permiteReabrir: Boolean(payload.permite_reabrir),
    laudoCard: payload.laudo_card || estadoAtual.laudoCard,
    modo: normalizarModoChat(
      payload.modo,
      normalizarModoChat(estadoAtual.modo),
    ),
  };
}

async function lerFilaOfflineLocal(): Promise<OfflinePendingMessage[]> {
  try {
    const valor = await FileSystem.readAsStringAsync(OFFLINE_QUEUE_FILE);
    const payload = JSON.parse(valor);
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const registro = item as Record<string, unknown>;
        const channel: OfflinePendingMessage["channel"] =
          registro.channel === "mesa" ? "mesa" : "chat";
        return {
          id: String(registro.id || ""),
          channel,
          laudoId:
            typeof registro.laudoId === "number" ? registro.laudoId : null,
          text: String(registro.text || "").trim(),
          createdAt: String(registro.createdAt || ""),
          title: String(registro.title || "").trim() || "Mensagem pendente",
          attachment: normalizarComposerAttachment(registro.attachment),
          referenceMessageId:
            typeof registro.referenceMessageId === "number"
              ? registro.referenceMessageId
              : null,
          attempts:
            typeof registro.attempts === "number"
              ? Math.max(0, registro.attempts)
              : 0,
          lastAttemptAt: String(registro.lastAttemptAt || ""),
          lastError: String(registro.lastError || "").trim(),
          nextRetryAt: String(registro.nextRetryAt || ""),
          aiMode: normalizarModoChat(registro.aiMode, "detalhado"),
          aiSummary: String(registro.aiSummary || "").trim(),
          aiMessagePrefix: String(registro.aiMessagePrefix || "").trim(),
        };
      })
      .filter((item) => item.id && (item.text || item.attachment));
  } catch {
    return [];
  }
}

async function salvarFilaOfflineLocal(
  fila: OfflinePendingMessage[],
): Promise<void> {
  try {
    if (!fila.length) {
      await FileSystem.deleteAsync(OFFLINE_QUEUE_FILE, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(
      OFFLINE_QUEUE_FILE,
      JSON.stringify(fila),
    );
  } catch (error) {
    console.warn("Falha ao salvar fila offline local.", error);
  }
}

async function lerNotificacoesLocais(): Promise<MobileActivityNotification[]> {
  try {
    const valor = await FileSystem.readAsStringAsync(NOTIFICATIONS_FILE);
    const payload = JSON.parse(valor);
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const registro = item as Record<string, unknown>;
        return {
          id: String(registro.id || ""),
          kind:
            registro.kind === "mesa_nova" ||
            registro.kind === "mesa_resolvida" ||
            registro.kind === "mesa_reaberta"
              ? registro.kind
              : "status",
          laudoId:
            typeof registro.laudoId === "number" ? registro.laudoId : null,
          title: String(registro.title || "").trim() || "Atividade do inspetor",
          body: String(registro.body || "").trim(),
          createdAt:
            String(registro.createdAt || "") || new Date().toISOString(),
          unread: Boolean(registro.unread),
          targetThread: registro.targetThread === "mesa" ? "mesa" : "chat",
        } as MobileActivityNotification;
      })
      .filter((item) => item.id && item.title);
  } catch {
    return [];
  }
}

async function salvarNotificacoesLocais(
  notificacoes: MobileActivityNotification[],
): Promise<void> {
  try {
    if (!notificacoes.length) {
      await FileSystem.deleteAsync(NOTIFICATIONS_FILE, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(
      NOTIFICATIONS_FILE,
      JSON.stringify(notificacoes),
    );
  } catch (error) {
    console.warn("Falha ao salvar a central de atividade local.", error);
  }
}

function chaveCacheLaudo(laudoId: number | null): string {
  return laudoId ? `laudo:${laudoId}` : "rascunho";
}

function chaveRascunho(thread: ActiveThread, laudoId: number | null): string {
  return `${thread}:${chaveCacheLaudo(laudoId)}`;
}

function normalizarComposerAttachment(
  payload: unknown,
): ComposerAttachment | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const registro = payload as Record<string, unknown>;
  if (registro.kind === "image") {
    const dadosImagem =
      typeof registro.dadosImagem === "string" ? registro.dadosImagem : "";
    const previewUri =
      typeof registro.previewUri === "string" ? registro.previewUri : "";
    const fileUri =
      typeof registro.fileUri === "string" ? registro.fileUri : "";
    const mimeType =
      typeof registro.mimeType === "string" ? registro.mimeType : "image/jpeg";
    const label = typeof registro.label === "string" ? registro.label : "";
    const resumo = typeof registro.resumo === "string" ? registro.resumo : "";
    if (!dadosImagem || !previewUri || !fileUri || !label) {
      return null;
    }
    return {
      kind: "image",
      dadosImagem,
      previewUri,
      fileUri,
      mimeType,
      label,
      resumo,
    };
  }

  if (registro.kind === "document") {
    const label = typeof registro.label === "string" ? registro.label : "";
    const resumo = typeof registro.resumo === "string" ? registro.resumo : "";
    const textoDocumento =
      typeof registro.textoDocumento === "string"
        ? registro.textoDocumento
        : "";
    const nomeDocumento =
      typeof registro.nomeDocumento === "string" ? registro.nomeDocumento : "";
    const fileUri =
      typeof registro.fileUri === "string" ? registro.fileUri : "";
    const mimeType =
      typeof registro.mimeType === "string"
        ? registro.mimeType
        : "application/octet-stream";
    if (!label || !nomeDocumento || !fileUri) {
      return null;
    }
    return {
      kind: "document",
      label,
      resumo,
      textoDocumento,
      nomeDocumento,
      chars: typeof registro.chars === "number" ? registro.chars : 0,
      truncado: Boolean(registro.truncado),
      fileUri,
      mimeType,
    };
  }

  return null;
}

function duplicarComposerAttachment(
  anexo: ComposerAttachment | null,
): ComposerAttachment | null {
  if (!anexo) {
    return null;
  }
  return anexo.kind === "image" ? { ...anexo } : { ...anexo };
}

function resumoPendenciaOffline(
  item: Pick<OfflinePendingMessage, "text" | "attachment">,
): string {
  if (item.text.trim()) {
    return item.text.trim();
  }
  return textoFallbackAnexo(item.attachment);
}

function iconePendenciaOffline(
  item: OfflinePendingMessage,
): keyof typeof MaterialCommunityIcons.glyphMap {
  if (item.channel === "mesa") {
    return item.attachment ? "paperclip" : "clipboard-text-outline";
  }
  if (item.attachment?.kind === "image") {
    return "image-outline";
  }
  if (item.attachment?.kind === "document") {
    return "file-document-outline";
  }
  return "message-processing-outline";
}

function legendaPendenciaOffline(item: OfflinePendingMessage): string {
  if (item.attachment?.kind === "image") {
    return "Imagem pronta para reenvio";
  }
  if (item.attachment?.kind === "document") {
    return "Documento pronto para reenvio";
  }
  return "Texto pendente para reenviar";
}

function resumirErroPendenciaOffline(erro: string): string {
  const texto = erro.trim();
  if (!texto) {
    return "";
  }
  return texto.length > 72 ? `${texto.slice(0, 69).trimEnd()}...` : texto;
}

function calcularBackoffPendenciaOfflineMs(tentativas: number): number {
  if (tentativas <= 1) {
    return 30_000;
  }
  if (tentativas === 2) {
    return 120_000;
  }
  if (tentativas === 3) {
    return 300_000;
  }
  return 600_000;
}

function pendenciaFilaProntaParaReenvio(
  item: OfflinePendingMessage,
  referencia = Date.now(),
): boolean {
  if (!item.nextRetryAt) {
    return true;
  }
  const proximaTentativa = new Date(item.nextRetryAt).getTime();
  if (Number.isNaN(proximaTentativa)) {
    return true;
  }
  return proximaTentativa <= referencia;
}

function detalheBackoffPendenciaOffline(item: OfflinePendingMessage): string {
  if (!item.nextRetryAt) {
    return "";
  }
  const proximaTentativa = new Date(item.nextRetryAt);
  if (Number.isNaN(proximaTentativa.getTime())) {
    return "";
  }
  return `Próxima tentativa após ${formatarHorarioAtividade(item.nextRetryAt)}`;
}

function prioridadePendenciaOffline(item: OfflinePendingMessage): number {
  if (item.lastError) {
    return 0;
  }
  if (pendenciaFilaProntaParaReenvio(item)) {
    return 1;
  }
  return 2;
}

function rotuloStatusPendenciaOffline(item: OfflinePendingMessage): string {
  if (item.lastError) {
    return "Com falha";
  }
  if (item.lastAttemptAt) {
    return "Tentado";
  }
  return "Pendente";
}

function detalheStatusPendenciaOffline(item: OfflinePendingMessage): string {
  if (item.lastError) {
    const tentativas =
      item.attempts <= 1 ? "1 tentativa" : `${item.attempts} tentativas`;
    const backoff = detalheBackoffPendenciaOffline(item);
    return `${tentativas} · ${resumirErroPendenciaOffline(item.lastError)}${backoff ? ` · ${backoff}` : ""}`;
  }
  if (item.lastAttemptAt) {
    return `Última tentativa em ${formatarHorarioAtividade(item.lastAttemptAt)}`;
  }
  return "Aguardando a primeira tentativa de reenvio";
}

function criarItemFilaOffline(params: {
  channel: OfflinePendingMessage["channel"];
  laudoId: number | null;
  text: string;
  title: string;
  attachment?: ComposerAttachment | null;
  referenceMessageId?: number | null;
  aiMode?: MobileChatMode;
  aiSummary?: string;
  aiMessagePrefix?: string;
}): OfflinePendingMessage {
  return {
    id: `${params.channel}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    channel: params.channel,
    laudoId: params.laudoId,
    text: params.text.trim(),
    createdAt: new Date().toISOString(),
    title: params.title.trim() || "Mensagem pendente",
    attachment: duplicarComposerAttachment(params.attachment || null),
    referenceMessageId: Number(params.referenceMessageId || 0) || null,
    attempts: 0,
    lastAttemptAt: "",
    lastError: "",
    nextRetryAt: "",
    aiMode: normalizarModoChat(params.aiMode, "detalhado"),
    aiSummary: String(params.aiSummary || "").trim(),
    aiMessagePrefix: String(params.aiMessagePrefix || "").trim(),
  };
}

function normalizarCacheLeitura(payload: unknown): MobileReadCache {
  if (!payload || typeof payload !== "object") {
    return CACHE_LEITURA_VAZIO;
  }

  const registro = payload as Record<string, unknown>;
  const laudos = Array.isArray(registro.laudos)
    ? (registro.laudos as MobileLaudoCard[])
    : [];
  const conversaAtual =
    registro.conversaAtual && typeof registro.conversaAtual === "object"
      ? (registro.conversaAtual as ChatState)
      : null;

  const conversasPorLaudo =
    registro.conversasPorLaudo && typeof registro.conversasPorLaudo === "object"
      ? Object.fromEntries(
          Object.entries(
            registro.conversasPorLaudo as Record<string, unknown>,
          ).map(([chave, valor]) => [
            chave,
            valor && typeof valor === "object"
              ? (valor as ChatState)
              : criarConversaNova(),
          ]),
        )
      : {};

  const mesaPorLaudo =
    registro.mesaPorLaudo && typeof registro.mesaPorLaudo === "object"
      ? Object.fromEntries(
          Object.entries(registro.mesaPorLaudo as Record<string, unknown>).map(
            ([chave, valor]) => [
              chave,
              Array.isArray(valor) ? (valor as MobileMesaMessage[]) : [],
            ],
          ),
        )
      : {};

  const chatDrafts =
    registro.chatDrafts && typeof registro.chatDrafts === "object"
      ? Object.fromEntries(
          Object.entries(registro.chatDrafts as Record<string, unknown>).map(
            ([chave, valor]) => [chave, typeof valor === "string" ? valor : ""],
          ),
        )
      : {};

  const mesaDrafts =
    registro.mesaDrafts && typeof registro.mesaDrafts === "object"
      ? Object.fromEntries(
          Object.entries(registro.mesaDrafts as Record<string, unknown>).map(
            ([chave, valor]) => [chave, typeof valor === "string" ? valor : ""],
          ),
        )
      : {};

  const chatAttachmentDrafts =
    registro.chatAttachmentDrafts &&
    typeof registro.chatAttachmentDrafts === "object"
      ? Object.fromEntries(
          Object.entries(
            registro.chatAttachmentDrafts as Record<string, unknown>,
          )
            .map(([chave, valor]) => [
              chave,
              normalizarComposerAttachment(valor),
            ])
            .filter(([, valor]) => Boolean(valor)),
        )
      : {};

  const mesaAttachmentDrafts =
    registro.mesaAttachmentDrafts &&
    typeof registro.mesaAttachmentDrafts === "object"
      ? Object.fromEntries(
          Object.entries(
            registro.mesaAttachmentDrafts as Record<string, unknown>,
          )
            .map(([chave, valor]) => [
              chave,
              normalizarComposerAttachment(valor),
            ])
            .filter(([, valor]) => Boolean(valor)),
        )
      : {};

  return {
    bootstrap:
      registro.bootstrap && typeof registro.bootstrap === "object"
        ? (registro.bootstrap as MobileBootstrapResponse)
        : null,
    laudos,
    conversaAtual,
    conversasPorLaudo,
    mesaPorLaudo,
    chatDrafts,
    mesaDrafts,
    chatAttachmentDrafts: chatAttachmentDrafts as Record<
      string,
      ComposerAttachment
    >,
    mesaAttachmentDrafts: mesaAttachmentDrafts as Record<
      string,
      ComposerAttachment
    >,
    updatedAt: typeof registro.updatedAt === "string" ? registro.updatedAt : "",
  };
}

async function lerCacheLeituraLocal(): Promise<MobileReadCache> {
  try {
    const valor = await FileSystem.readAsStringAsync(READ_CACHE_FILE);
    return normalizarCacheLeitura(JSON.parse(valor));
  } catch {
    return CACHE_LEITURA_VAZIO;
  }
}

async function salvarCacheLeituraLocal(cache: MobileReadCache): Promise<void> {
  try {
    const temConteudo =
      Boolean(cache.bootstrap) ||
      Boolean(cache.conversaAtual) ||
      cache.laudos.length > 0 ||
      Object.keys(cache.conversasPorLaudo).length > 0 ||
      Object.keys(cache.mesaPorLaudo).length > 0 ||
      Object.keys(cache.chatDrafts).length > 0 ||
      Object.keys(cache.mesaDrafts).length > 0 ||
      Object.keys(cache.chatAttachmentDrafts).length > 0 ||
      Object.keys(cache.mesaAttachmentDrafts).length > 0;

    if (!temConteudo) {
      await FileSystem.deleteAsync(READ_CACHE_FILE, { idempotent: true });
      return;
    }

    await FileSystem.writeAsStringAsync(READ_CACHE_FILE, JSON.stringify(cache));
  } catch (error) {
    console.warn("Falha ao salvar o cache de leitura local.", error);
  }
}

function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

function normalizarIdsEstadoHistoricoLocal(valor: unknown): number[] {
  if (!Array.isArray(valor)) {
    return [];
  }

  const ids = valor
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter((item): item is number => Number.isInteger(item) && item > 0);

  return Array.from(new Set(ids));
}

function ehOpcaoValida<T extends readonly string[]>(
  valor: unknown,
  opcoes: T,
): valor is T[number] {
  return (
    typeof valor === "string" && (opcoes as readonly string[]).includes(valor)
  );
}

function construirUrlCanalSuporte(rawValue: string): string {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  if (/^(https?:\/\/|whatsapp:\/\/)/i.test(value)) {
    return value;
  }
  const digits = value.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

async function lerEstadoHistoricoLocal(): Promise<LocalHistoryUiState> {
  try {
    const valor = await FileSystem.readAsStringAsync(HISTORY_UI_STATE_FILE);
    const payload = JSON.parse(valor);
    if (!ehRegistro(payload)) {
      return { laudosFixadosIds: [], historicoOcultoIds: [] };
    }
    return {
      laudosFixadosIds: normalizarIdsEstadoHistoricoLocal(
        payload.laudosFixadosIds,
      ),
      historicoOcultoIds: normalizarIdsEstadoHistoricoLocal(
        payload.historicoOcultoIds,
      ),
    };
  } catch {
    return { laudosFixadosIds: [], historicoOcultoIds: [] };
  }
}

async function salvarEstadoHistoricoLocal(
  estado: LocalHistoryUiState,
): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(
      HISTORY_UI_STATE_FILE,
      JSON.stringify({
        laudosFixadosIds: Array.from(new Set(estado.laudosFixadosIds)),
        historicoOcultoIds: Array.from(new Set(estado.historicoOcultoIds)),
      }),
    );
  } catch (error) {
    console.warn("Falha ao salvar o estado local do histórico.", error);
  }
}

function limparCachePorPrivacidade(cache: MobileReadCache): MobileReadCache {
  return {
    ...CACHE_LEITURA_VAZIO,
    bootstrap: cache.bootstrap,
    updatedAt: new Date().toISOString(),
  };
}

function serializarPayloadExportacao(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

async function compartilharTextoExportado(params: {
  extension: "json" | "txt";
  content: string;
  prefixo: string;
}): Promise<boolean> {
  try {
    const baseDir = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ""}tariel-exports`;
    await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const uri = `${baseDir}/${params.prefixo}-${carimbo}.${params.extension}`;
    await FileSystem.writeAsStringAsync(uri, params.content);
    const podeCompartilhar = await Sharing.isAvailableAsync();
    if (podeCompartilhar) {
      await Sharing.shareAsync(uri, {
        dialogTitle: "Exportar dados do Tariel Inspetor",
        mimeType:
          params.extension === "json" ? "application/json" : "text/plain",
      });
    }
    return true;
  } catch (error) {
    console.warn("Falha ao exportar dados do app.", error);
    return false;
  }
}

function obterIntervaloMonitoramentoMs(
  economiaDados: boolean,
  usoBateria: (typeof BATTERY_OPTIONS)[number],
): number {
  if (economiaDados || usoBateria === "Econômico") {
    return 60_000;
  }
  if (usoBateria === "Otimizado") {
    return 40_000;
  }
  return 25_000;
}

async function podeSincronizarNaRedeAtual(
  wifiOnlySync: boolean,
): Promise<boolean> {
  return canSyncOnCurrentNetwork(wifiOnlySync);
}

const MAX_LAUDOS_MONITORADOS_MESA = 6;

function obterEscalaFonte(tamanho: (typeof FONT_SIZE_OPTIONS)[number]): number {
  if (tamanho === "pequeno") {
    return 0.94;
  }
  if (tamanho === "grande") {
    return 1.08;
  }
  return 1;
}

function obterEscalaDensidade(
  densidade: (typeof DENSITY_OPTIONS)[number],
): number {
  return densidade === "compacta" ? 0.9 : 1;
}

function montarHistoricoParaEnvio(
  mensagens: MobileChatMessage[],
): Array<{ papel: "usuario" | "assistente"; texto: string }> {
  return mensagens
    .filter(
      (mensagem) =>
        (mensagem.papel === "usuario" || mensagem.papel === "assistente") &&
        typeof mensagem.texto === "string" &&
        mensagem.texto.trim(),
    )
    .slice(-20)
    .map((mensagem) => ({
      papel: mensagem.papel === "usuario" ? "usuario" : "assistente",
      texto: mensagem.texto.trim(),
    }));
}

function normalizarModoChat(
  modo: unknown,
  fallback: MobileChatMode = "detalhado",
): MobileChatMode {
  const valor = String(modo || "")
    .trim()
    .toLowerCase();
  if (valor === "curto") {
    return "curto";
  }
  if (valor === "deep_research" || valor === "deepresearch") {
    return "deep_research";
  }
  if (valor === "detalhado") {
    return "detalhado";
  }
  return fallback;
}

function inferirSetorConversa(conversa: ChatState | null | undefined): string {
  const tipoTemplate = String(conversa?.laudoCard?.tipo_template || "")
    .trim()
    .toLowerCase();

  switch (tipoTemplate) {
    case "rti":
    case "nr10_rti":
      return "rti";
    case "nr12":
    case "nr12_maquinas":
    case "nr12maquinas":
      return "nr12";
    case "nr13":
    case "nr13_caldeira":
      return "nr13";
    case "spda":
    case "pie":
    case "avcb":
    case "loto":
    case "nr10":
    case "nr35":
      return tipoTemplate;
    case "cbmgo":
      return "avcb";
    default:
      return "geral";
  }
}

function extrairModoConversaDasMensagens(
  mensagens: MobileChatMessage[],
): MobileChatMode {
  for (let index = mensagens.length - 1; index >= 0; index -= 1) {
    const mensagem = mensagens[index];
    if (typeof mensagem?.modo === "string" && mensagem.modo.trim()) {
      return normalizarModoChat(mensagem.modo);
    }
  }
  return "detalhado";
}

function criarMensagemAssistenteServidor(
  resposta: MobileChatSendResult,
): MobileChatMessage | null {
  const texto = resposta.assistantText.trim();
  if (!texto) {
    return null;
  }

  return {
    id: Date.now() + 1,
    papel: "assistente",
    texto,
    tipo: "assistant",
    modo: normalizarModoChat(resposta.modo),
    citacoes: resposta.citacoes.length ? resposta.citacoes : undefined,
    confianca_ia: resposta.confiancaIa || undefined,
  };
}

function normalizarConversa(
  payload: MobileLaudoStatusResponse | MobileLaudoMensagensResponse,
): ChatState {
  const mensagens = "itens" in payload ? payload.itens : [];
  return {
    laudoId: payload.laudo_id ?? null,
    estado: payload.estado,
    statusCard: payload.status_card || "aberto",
    permiteEdicao: Boolean(payload.permite_edicao),
    permiteReabrir: Boolean(payload.permite_reabrir),
    laudoCard: payload.laudo_card || null,
    modo: normalizarModoChat(
      payload.modo,
      extrairModoConversaDasMensagens(mensagens),
    ),
    mensagens,
  };
}

function criarConversaNova(): ChatState {
  return {
    laudoId: null,
    estado: "sem_relatorio",
    statusCard: "aberto",
    permiteEdicao: true,
    permiteReabrir: false,
    laudoCard: null,
    modo: "detalhado",
    mensagens: [],
  };
}

function previewChatLiberadoParaConversa(
  conversa: ChatState | null | undefined,
): boolean {
  return Boolean(
    conversa &&
    (!conversa.laudoId ||
      (!conversa.permiteEdicao && !conversa.mensagens.length)),
  );
}

function podeEditarConversaNoComposer(
  conversa: ChatState | null | undefined,
): boolean {
  return (
    !conversa ||
    conversa.permiteEdicao ||
    previewChatLiberadoParaConversa(conversa)
  );
}

function textoFallbackAnexo(anexo: ComposerAttachment | null): string {
  if (!anexo) {
    return "";
  }
  if (anexo.kind === "image") {
    return "Imagem enviada";
  }
  return `Documento: ${anexo.nomeDocumento}`;
}

function nomeArquivoSeguro(nome: string, fallback: string): string {
  const base = String(nome || "").trim();
  const semSeparadores = base
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return semSeparadores || fallback;
}

function inferirExtensaoAnexo(anexo: MobileAttachment): string {
  const nome = nomeExibicaoAnexo(anexo, "anexo").toLowerCase();
  const correspondencias = [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".pdf",
    ".docx",
    ".doc",
  ];

  for (const extensao of correspondencias) {
    if (nome.endsWith(extensao)) {
      return extensao;
    }
  }

  const mime = String(anexo.mime_type || "").toLowerCase();
  if (mime.includes("png")) {
    return ".png";
  }
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return ".jpg";
  }
  if (mime.includes("webp")) {
    return ".webp";
  }
  if (mime.includes("pdf")) {
    return ".pdf";
  }
  if (mime.includes("wordprocessingml") || mime.includes("docx")) {
    return ".docx";
  }
  if (mime.includes("msword")) {
    return ".doc";
  }
  return "";
}

function chaveAnexo(anexo: MobileAttachment, fallback: string): string {
  const partes = [
    anexo.id,
    anexo.url,
    anexo.nome,
    anexo.nome_original,
    anexo.label,
  ]
    .map((parte) => String(parte ?? "").trim())
    .filter(Boolean);

  return partes.join(":") || fallback;
}

function erroSugereModoOffline(erro: unknown): boolean {
  const texto = String(erro instanceof Error ? erro.message : erro || "")
    .trim()
    .toLowerCase();
  if (!texto) {
    return false;
  }

  return [
    "network request failed",
    "network",
    "offline",
    "internet",
    "connection",
    "conex",
    "fetch",
    "timeout",
    "timed out",
  ].some((trecho) => texto.includes(trecho));
}

function assinaturaStatusLaudo(item: MobileLaudoCard): string {
  return [
    item.status_card,
    item.status_revisao,
    item.status_card_label,
    item.permite_reabrir ? "1" : "0",
    item.permite_edicao ? "1" : "0",
  ].join("|");
}

function assinaturaMensagemMesa(item: MobileMesaMessage): string {
  return [
    item.id,
    item.lida ? "1" : "0",
    item.resolvida_em || "",
    item.texto || "",
  ].join("|");
}

function resumoMensagemAtividade(texto: string, fallback: string): string {
  const valor = String(texto || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!valor) {
    return fallback;
  }
  return valor.length > 120 ? `${valor.slice(0, 117)}...` : valor;
}

function obterResumoReferenciaMensagem(
  referenciaId: number | null | undefined,
  mensagensChat: MobileChatMessage[],
  mensagensMesa: MobileMesaMessage[],
): string {
  const alvo = Number(referenciaId || 0) || null;
  if (!alvo) {
    return "";
  }

  const mensagemChat = mensagensChat.find(
    (item) => Number(item.id || 0) === alvo,
  );
  if (mensagemChat?.texto?.trim()) {
    return resumoMensagemAtividade(mensagemChat.texto, `Mensagem #${alvo}`);
  }

  const mensagemMesa = mensagensMesa.find(
    (item) => Number(item.id || 0) === alvo,
  );
  if (mensagemMesa?.texto?.trim()) {
    return resumoMensagemAtividade(mensagemMesa.texto, `Mensagem #${alvo}`);
  }

  return `Mensagem #${alvo}`;
}

function formatarTipoTemplateLaudo(value: string | null | undefined): string {
  const texto = String(value || "").trim();
  if (!texto) {
    return "Laudo padrão";
  }

  return texto
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (parte) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase(),
    )
    .join(" ");
}

function criarNotificacaoStatusLaudo(
  item: MobileLaudoCard,
): MobileActivityNotification {
  const mapaTitulo: Record<string, string> = {
    aprovado: "Laudo aprovado",
    ajustes: "Mesa pediu ajustes",
    aguardando: "Laudo em análise da mesa",
    aberto: "Laudo voltou ao fluxo",
  };
  const mapaDescricao: Record<string, string> = {
    aprovado: `${item.titulo} foi aprovado e já pode seguir como concluído.`,
    ajustes: `${item.titulo} recebeu ajustes e pede sua atenção no app.`,
    aguardando: `${item.titulo} foi enviado para a mesa avaliadora.`,
    aberto: `${item.titulo} voltou ao fluxo ativo do inspetor.`,
  };

  return {
    id: `status:${item.id}:${assinaturaStatusLaudo(item)}`,
    kind: "status",
    laudoId: item.id,
    title: mapaTitulo[item.status_card] || "Status do laudo atualizado",
    body:
      mapaDescricao[item.status_card] ||
      `${item.titulo} mudou para ${item.status_card_label}.`,
    createdAt: new Date().toISOString(),
    unread: true,
    targetThread: item.status_card === "ajustes" ? "mesa" : "chat",
  };
}

function criarNotificacaoMesa(
  kind: "status" | "mesa_nova" | "mesa_resolvida" | "mesa_reaberta",
  mensagemMesa: MobileMesaMessage,
  tituloLaudo: string,
): MobileActivityNotification {
  const mapaTitulo: Record<
    "status" | "mesa_nova" | "mesa_resolvida" | "mesa_reaberta",
    string
  > = {
    status: "Atividade da mesa",
    mesa_nova: "Nova mensagem da mesa",
    mesa_resolvida: "Pendência marcada como resolvida",
    mesa_reaberta: "Pendência reaberta pela mesa",
  };
  const fallback =
    kind === "mesa_resolvida"
      ? "A mesa marcou uma pendência como resolvida."
      : kind === "mesa_reaberta"
        ? "A mesa reabriu uma pendência para novo ajuste."
        : "A mesa enviou uma nova atualização.";

  return {
    id:
      kind === "mesa_nova"
        ? `mesa:${mensagemMesa.id}`
        : `mesa:${mensagemMesa.id}:${kind}:${mensagemMesa.resolvida_em || "aberta"}`,
    kind,
    laudoId: mensagemMesa.laudo_id,
    title: mapaTitulo[kind],
    body: `${tituloLaudo}: ${resumoMensagemAtividade(mensagemMesa.texto, fallback)}`,
    createdAt: new Date().toISOString(),
    unread: true,
    targetThread: "mesa",
  };
}

function criarNotificacaoSistema(params: {
  title: string;
  body: string;
  kind?: "system" | "alerta_critico";
  laudoId?: number | null;
  targetThread?: ActiveThread;
}): MobileActivityNotification {
  const kind = params.kind || "system";
  return {
    id: `${kind}:${Date.now()}:${Math.random().toString(16).slice(2, 7)}`,
    kind,
    laudoId: params.laudoId ?? null,
    title: params.title,
    body: params.body,
    createdAt: new Date().toISOString(),
    unread: true,
    targetThread: params.targetThread || "chat",
  };
}

function selecionarLaudosParaMonitoramentoMesa(params: {
  laudos: MobileLaudoCard[];
  laudoAtivoId: number | null;
}): number[] {
  const ids: number[] = [];

  if (params.laudoAtivoId) {
    ids.push(params.laudoAtivoId);
  }

  for (const item of params.laudos) {
    if (ids.length >= MAX_LAUDOS_MONITORADOS_MESA) {
      break;
    }
    if (ids.includes(item.id)) {
      continue;
    }
    if (item.status_card === "ajustes" || item.status_card === "aguardando") {
      ids.push(item.id);
    }
  }

  return ids;
}

function mapearStatusLaudoVisual(statusCard: string) {
  switch (statusCard) {
    case "aprovado":
      return {
        tone: "success" as const,
        icon: "check-decagram-outline" as const,
      };
    case "ajustes":
      return {
        tone: "danger" as const,
        icon: "alert-circle-outline" as const,
      };
    case "aguardando":
      return {
        tone: "accent" as const,
        icon: "clipboard-clock-outline" as const,
      };
    default:
      return {
        tone: "muted" as const,
        icon: "file-document-outline" as const,
      };
  }
}

function formatarHorarioAtividade(dataIso: string): string {
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) {
    return "agora";
  }
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function obterTimeoutBloqueioMs(
  value: (typeof LOCK_TIMEOUT_OPTIONS)[number],
): number | null {
  if (value === "imediatamente") {
    return 0;
  }
  if (value === "1 minuto") {
    return 60_000;
  }
  if (value === "5 minutos") {
    return 5 * 60_000;
  }
  if (value === "15 minutos") {
    return 15 * 60_000;
  }
  return null;
}

function obterJanelaRetencaoMs(
  value: (typeof DATA_RETENTION_OPTIONS)[number],
): number | null {
  if (value === "30 dias") {
    return 30 * 24 * 60 * 60 * 1000;
  }
  if (value === "90 dias") {
    return 90 * 24 * 60 * 60 * 1000;
  }
  if (value === "1 ano") {
    return 365 * 24 * 60 * 60 * 1000;
  }
  return null;
}

function filtrarItensPorRetencao<T>(
  items: T[],
  janelaMs: number | null,
  getDateIso: (item: T) => string,
): T[] {
  if (!janelaMs) {
    return items;
  }
  const limite = Date.now() - janelaMs;
  return items.filter((item) => {
    const valor = new Date(getDateIso(item)).getTime();
    if (Number.isNaN(valor)) {
      return true;
    }
    return valor >= limite;
  });
}

function montarAnexoImagem(
  asset: ImagePicker.ImagePickerAsset,
  resumo: string,
): ComposerAttachment {
  if (!asset.base64) {
    throw new Error("Não foi possível preparar a imagem selecionada.");
  }

  const mimeType = (asset.mimeType || "image/jpeg").replace(
    "image/jpg",
    "image/jpeg",
  );
  const nomeArquivo =
    asset.fileName?.trim() ||
    `evidencia-${Date.now()}.${mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg"}`;

  return {
    kind: "image",
    label: nomeArquivo,
    resumo,
    dadosImagem: `data:${mimeType};base64,${asset.base64}`,
    previewUri: asset.uri,
    fileUri: asset.uri,
    mimeType,
  };
}

function montarAnexoDocumentoLocal(
  asset: DocumentPicker.DocumentPickerAsset,
  resumo: string,
): ComposerAttachment {
  return {
    kind: "document",
    label: asset.name,
    resumo,
    textoDocumento: "",
    nomeDocumento: asset.name,
    chars: 0,
    truncado: false,
    fileUri: asset.uri,
    mimeType: asset.mimeType || "application/octet-stream",
  };
}

function montarAnexoDocumentoMesa(
  asset: DocumentPicker.DocumentPickerAsset,
): ComposerAttachment {
  return montarAnexoDocumentoLocal(
    asset,
    "Documento pronto para seguir direto para a mesa avaliadora.",
  );
}

export function InspectorMobileApp() {
  const [conversa, setConversa] = useState<ChatState | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<ActiveThread>("chat");
  const [laudosDisponiveis, setLaudosDisponiveis] = useState<MobileLaudoCard[]>(
    [],
  );
  const [carregandoLaudos, setCarregandoLaudos] = useState(false);
  const [erroLaudos, setErroLaudos] = useState("");
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  const [sincronizandoConversa, setSincronizandoConversa] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [anexoRascunho, setAnexoRascunho] = useState<ComposerAttachment | null>(
    null,
  );
  const [erroConversa, setErroConversa] = useState("");
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);
  const [preparandoAnexo, setPreparandoAnexo] = useState(false);
  const [mensagensMesa, setMensagensMesa] = useState<MobileMesaMessage[]>([]);
  const [erroMesa, setErroMesa] = useState("");
  const [mensagemMesa, setMensagemMesa] = useState("");
  const [anexoMesaRascunho, setAnexoMesaRascunho] =
    useState<ComposerAttachment | null>(null);
  const [mensagemMesaReferenciaAtiva, setMensagemMesaReferenciaAtiva] =
    useState<MessageReferenceState | null>(null);
  const [carregandoMesa, setCarregandoMesa] = useState(false);
  const [sincronizandoMesa, setSincronizandoMesa] = useState(false);
  const [enviandoMesa, setEnviandoMesa] = useState(false);
  const [laudoMesaCarregado, setLaudoMesaCarregado] = useState<number | null>(
    null,
  );
  const [anexoAbrindoChave, setAnexoAbrindoChave] = useState("");
  const [previewAnexoImagem, setPreviewAnexoImagem] =
    useState<AttachmentPreviewState | null>(null);
  const [mensagemChatDestacadaId, setMensagemChatDestacadaId] = useState<
    number | null
  >(null);
  const [layoutMensagensChatVersao, setLayoutMensagensChatVersao] = useState(0);
  const [filaOffline, setFilaOffline] = useState<OfflinePendingMessage[]>([]);
  const [sincronizandoFilaOffline, setSincronizandoFilaOffline] =
    useState(false);
  const [sincronizandoItemFilaId, setSincronizandoItemFilaId] = useState("");
  const [notificacoes, setNotificacoes] = useState<
    MobileActivityNotification[]
  >([]);
  const [cacheLeitura, setCacheLeitura] =
    useState<MobileReadCache>(CACHE_LEITURA_VAZIO);
  const [, setUsandoCacheOffline] = useState(false);
  const [centralAtividadeAberta, setCentralAtividadeAberta] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [filtroHistorico] = useState<HistoryDrawerFilter>("todos");
  const [filaOfflineAberta, setFilaOfflineAberta] = useState(false);
  const [configuracoesAberta, setConfiguracoesAberta] = useState(false);
  const [anexosAberto, setAnexosAberto] = useState(false);
  const [introVisivel, setIntroVisivel] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [filtroFilaOffline, setFiltroFilaOffline] =
    useState<OfflineQueueFilter>("all");
  const [voiceRuntimeState, setVoiceRuntimeState] = useState({
    voices: [] as Array<{
      identifier?: string;
      name?: string;
      language?: string;
    }>,
    ttsSupported: false,
    sttSupported: false,
  });
  const [chatAiBehaviorNotice, setChatAiBehaviorNotice] = useState("");
  const [verificandoAtualizacoes, setVerificandoAtualizacoes] = useState(false);
  const [sincronizandoAgora, setSincronizandoAgora] = useState(false);
  const [limpandoCache, setLimpandoCache] = useState(false);
  const [ultimaLimpezaCacheEm, setUltimaLimpezaCacheEm] = useState("");
  const {
    state: settingsState,
    hydrated: settingsHydrated,
    actions: settingsActions,
  } = useSettingsStore();
  const appRuntime = useMemo(() => getInstalledAppRuntimeInfo(), []);
  const perfilNome = settingsState.account.fullName;
  const setPerfilNome = (value: string) =>
    settingsActions.updateAccount({ fullName: value });
  const perfilExibicao = settingsState.account.displayName;
  const setPerfilExibicao = (value: string) =>
    settingsActions.updateAccount({ displayName: value });
  const perfilFotoUri = settingsState.account.photoUri;
  const setPerfilFotoUri = (value: string) =>
    settingsActions.updateAccount({ photoUri: value });
  const perfilFotoHint = settingsState.account.photoHint;
  const setPerfilFotoHint = (value: string) =>
    settingsActions.updateAccount({ photoHint: value });
  const [laudosFixadosIds, setLaudosFixadosIds] = useState<number[]>([]);
  const [historicoOcultoIds, setHistoricoOcultoIds] = useState<number[]>([]);
  const emailAtualConta = settingsState.account.email;
  const setEmailAtualConta = (value: string) =>
    settingsActions.updateAccount({ email: value });
  const contaTelefone = settingsState.account.phone;
  const modeloIa = settingsState.ai.model;
  const setModeloIa = (value: (typeof AI_MODEL_OPTIONS)[number]) =>
    settingsActions.updateAi({ model: value });
  const estiloResposta = settingsState.ai.responseStyle;
  const setEstiloResposta = (value: (typeof RESPONSE_STYLE_OPTIONS)[number]) =>
    settingsActions.updateAi({ responseStyle: value });
  const idiomaResposta = settingsState.ai.responseLanguage;
  const setIdiomaResposta = (
    value: (typeof RESPONSE_LANGUAGE_OPTIONS)[number],
  ) => settingsActions.updateAi({ responseLanguage: value });
  const memoriaIa = settingsState.ai.memoryEnabled;
  const setMemoriaIa = (value: boolean) =>
    settingsActions.updateAi({ memoryEnabled: value });
  const aprendizadoIa = settingsState.ai.learningOptIn;
  const setAprendizadoIa = (value: boolean) =>
    settingsActions.updateAi({ learningOptIn: value });
  const tomConversa = settingsState.ai.tone;
  const setTomConversa = (value: (typeof CONVERSATION_TONE_OPTIONS)[number]) =>
    settingsActions.updateAi({ tone: value });
  const temperaturaIa = settingsState.ai.temperature;
  const setTemperaturaIa = (value: number) =>
    settingsActions.updateAi({ temperature: value });
  const temaApp = settingsState.appearance.theme;
  const setTemaApp = (value: (typeof THEME_OPTIONS)[number]) =>
    settingsActions.updateAppearance({ theme: value });
  const tamanhoFonte = settingsState.appearance.fontScale;
  const setTamanhoFonte = (value: (typeof FONT_SIZE_OPTIONS)[number]) =>
    settingsActions.updateAppearance({ fontScale: value });
  const densidadeInterface = settingsState.appearance.density;
  const setDensidadeInterface = (value: (typeof DENSITY_OPTIONS)[number]) =>
    settingsActions.updateAppearance({ density: value });
  const corDestaque = settingsState.appearance.accentColor;
  const setCorDestaque = (value: (typeof ACCENT_OPTIONS)[number]) =>
    settingsActions.updateAppearance({ accentColor: value });
  const animacoesAtivas = settingsState.appearance.animationsEnabled;
  const setAnimacoesAtivas = (value: boolean) =>
    settingsActions.updateAppearance({ animationsEnabled: value });
  const notificaRespostas = settingsState.notifications.responseAlertsEnabled;
  const setNotificaRespostas = (value: boolean) =>
    settingsActions.updateNotifications({ responseAlertsEnabled: value });
  const notificaPush = settingsState.notifications.pushEnabled;
  const setNotificaPush = (value: boolean) =>
    settingsActions.updateNotifications({ pushEnabled: value });
  const chatCategoryEnabled = settingsState.notifications.chatCategoryEnabled;
  const setChatCategoryEnabled = (value: boolean) =>
    settingsActions.updateNotifications({ chatCategoryEnabled: value });
  const mesaCategoryEnabled = settingsState.notifications.mesaCategoryEnabled;
  const setMesaCategoryEnabled = (value: boolean) =>
    settingsActions.updateNotifications({ mesaCategoryEnabled: value });
  const systemCategoryEnabled =
    settingsState.notifications.systemCategoryEnabled;
  const setSystemCategoryEnabled = (value: boolean) =>
    settingsActions.updateNotifications({ systemCategoryEnabled: value });
  const criticalAlertsEnabled =
    settingsState.notifications.criticalAlertsEnabled;
  const setCriticalAlertsEnabled = (value: boolean) =>
    settingsActions.updateNotifications({ criticalAlertsEnabled: value });
  const somNotificacao = settingsState.notifications.soundPreset;
  const setSomNotificacao = (
    value: (typeof NOTIFICATION_SOUND_OPTIONS)[number],
  ) =>
    settingsActions.updateNotifications({
      soundPreset: value,
      soundEnabled: value !== "Silencioso",
    });
  const vibracaoAtiva = settingsState.notifications.vibrationEnabled;
  const setVibracaoAtiva = (value: boolean) =>
    settingsActions.updateNotifications({ vibrationEnabled: value });
  const emailsAtivos = settingsState.notifications.emailEnabled;
  const setEmailsAtivos = (value: boolean) =>
    settingsActions.updateNotifications({ emailEnabled: value });
  const salvarHistoricoConversas =
    settingsState.dataControls.chatHistoryEnabled;
  const setSalvarHistoricoConversas = (value: boolean) =>
    settingsActions.updateDataControls({ chatHistoryEnabled: value });
  const compartilharMelhoriaIa = settingsState.ai.learningOptIn;
  const setCompartilharMelhoriaIa = (value: boolean) =>
    settingsActions.updateAi({ learningOptIn: value });
  const backupAutomatico = settingsState.dataControls.deviceBackupEnabled;
  const setBackupAutomatico = (value: boolean) =>
    settingsActions.updateDataControls({ deviceBackupEnabled: value });
  const sincronizacaoDispositivos =
    settingsState.dataControls.crossDeviceSyncEnabled;
  const setSincronizacaoDispositivos = (value: boolean) =>
    settingsActions.updateDataControls({ crossDeviceSyncEnabled: value });
  const analyticsOptIn = settingsState.dataControls.analyticsOptIn;
  const setAnalyticsOptIn = (value: boolean) =>
    settingsActions.updateDataControls({ analyticsOptIn: value });
  const crashReportsOptIn = settingsState.dataControls.crashReportsOptIn;
  const setCrashReportsOptIn = (value: boolean) =>
    settingsActions.updateDataControls({ crashReportsOptIn: value });
  const wifiOnlySync = settingsState.dataControls.wifiOnlySync;
  const setWifiOnlySync = (value: boolean) =>
    settingsActions.updateDataControls({ wifiOnlySync: value });
  const autoUploadAttachments =
    settingsState.dataControls.autoUploadAttachments;
  const setAutoUploadAttachments = (value: boolean) =>
    settingsActions.updateDataControls({ autoUploadAttachments: value });
  const mediaCompression = settingsState.dataControls.mediaCompression;
  const setMediaCompression = (
    value: typeof settingsState.dataControls.mediaCompression,
  ) => settingsActions.updateDataControls({ mediaCompression: value });
  const speechEnabled = settingsState.speech.enabled;
  const setSpeechEnabled = (value: boolean) =>
    settingsActions.updateSpeech({
      enabled: value,
      autoTranscribe: value ? settingsState.speech.autoTranscribe : false,
      autoReadResponses: value ? settingsState.speech.autoReadResponses : false,
    });
  const entradaPorVoz = settingsState.speech.autoTranscribe;
  const setEntradaPorVoz = (value: boolean) =>
    settingsActions.updateSpeech({
      autoTranscribe: value,
      enabled: value || settingsState.speech.autoReadResponses,
    });
  const respostaPorVoz = settingsState.speech.autoReadResponses;
  const setRespostaPorVoz = (value: boolean) =>
    settingsActions.updateSpeech({
      autoReadResponses: value,
      enabled: value || settingsState.speech.autoTranscribe,
    });
  const voiceLanguage = settingsState.speech.voiceLanguage;
  const setVoiceLanguage = (value: typeof settingsState.speech.voiceLanguage) =>
    settingsActions.updateSpeech({ voiceLanguage: value });
  const speechRate = settingsState.speech.speechRate;
  const setSpeechRate = (value: number) =>
    settingsActions.updateSpeech({ speechRate: value });
  const preferredVoiceId = settingsState.speech.voiceId;
  const setPreferredVoiceId = (value: string) =>
    settingsActions.updateSpeech({ voiceId: value });
  const uploadArquivosAtivo = settingsState.attachments.enabled;
  const setUploadArquivosAtivo = (value: boolean) =>
    settingsActions.updateAttachments({ enabled: value });
  const economiaDados = settingsState.system.dataSaver;
  const setEconomiaDados = (value: boolean) =>
    settingsActions.updateSystem({ dataSaver: value });
  const usoBateria = settingsState.system.batteryMode;
  const setUsoBateria = (value: (typeof BATTERY_OPTIONS)[number]) =>
    settingsActions.updateSystem({ batteryMode: value });
  const idiomaApp = settingsState.system.language;
  const setIdiomaApp = (value: (typeof APP_LANGUAGE_OPTIONS)[number]) =>
    settingsActions.updateSystem({ language: value });
  const regiaoApp = settingsState.system.region;
  const setRegiaoApp = (value: (typeof REGION_OPTIONS)[number]) =>
    settingsActions.updateSystem({ region: value });
  const biometriaLocalSuportada = false;
  const deviceBiometricsEnabled =
    biometriaLocalSuportada && settingsState.security.deviceBiometricsEnabled;
  const setDeviceBiometricsEnabled = (value: boolean) =>
    settingsActions.updateSecurity({ deviceBiometricsEnabled: value });
  const requireAuthOnOpen = settingsState.security.requireAuthOnOpen;
  const setRequireAuthOnOpen = (value: boolean) =>
    settingsActions.updateSecurity({ requireAuthOnOpen: value });
  const hideInMultitask = settingsState.security.hideInMultitask;
  const setHideInMultitask = (value: boolean) =>
    settingsActions.updateSecurity({ hideInMultitask: value });
  const lockTimeout = settingsState.security.lockTimeout;
  const setLockTimeout = (value: (typeof LOCK_TIMEOUT_OPTIONS)[number]) =>
    settingsActions.updateSecurity({ lockTimeout: value });
  const retencaoDados = settingsState.dataControls.retention;
  const setRetencaoDados = (value: (typeof DATA_RETENTION_OPTIONS)[number]) =>
    settingsActions.updateDataControls({ retention: value });
  const mostrarConteudoNotificacao =
    settingsState.notifications.showMessageContent;
  const setMostrarConteudoNotificacao = (value: boolean) =>
    settingsActions.updateNotifications({ showMessageContent: value });
  const ocultarConteudoBloqueado =
    settingsState.notifications.hideContentOnLockScreen;
  const setOcultarConteudoBloqueado = (value: boolean) =>
    settingsActions.updateNotifications({ hideContentOnLockScreen: value });
  const mostrarSomenteNovaMensagem =
    settingsState.notifications.onlyShowNewMessage;
  const setMostrarSomenteNovaMensagem = (value: boolean) =>
    settingsActions.updateNotifications({ onlyShowNewMessage: value });
  const [buscaConfiguracoes] = useState("");
  const filtroConfiguracoes: SettingsDrawerFilter = "todos";
  const [bloqueioAppAtivo, setBloqueioAppAtivo] = useState(false);
  const microfonePermitido = settingsState.security.microphonePermission;
  const setMicrofonePermitido = (value: boolean) =>
    settingsActions.updateSecurity({ microphonePermission: value });
  const cameraPermitida = settingsState.security.cameraPermission;
  const setCameraPermitida = (value: boolean) =>
    settingsActions.updateSecurity({ cameraPermission: value });
  const arquivosPermitidos = settingsState.security.filesPermission;
  const setArquivosPermitidos = (value: boolean) =>
    settingsActions.updateSecurity({ filesPermission: value });
  const notificacoesPermitidas = settingsState.security.notificationsPermission;
  const setNotificacoesPermitidas = (value: boolean) =>
    settingsActions.updateSecurity({ notificationsPermission: value });
  const biometriaPermitida = settingsState.security.biometricsPermission;
  const setBiometriaPermitida = (value: boolean) =>
    settingsActions.updateSecurity({ biometricsPermission: value });
  const attachmentHandlingPolicy = useMemo(
    () => buildAttachmentHandlingPolicy(settingsState),
    [settingsState],
  );
  const aiRequestConfig = useMemo(
    () => buildChatAiRequestConfig(settingsState.ai),
    [settingsState.ai],
  );
  const scrollRef = useRef<ScrollView | null>(null);
  const carregarListaLaudosRef = useRef<
    (accessToken: string, silencioso?: boolean) => Promise<MobileLaudoCard[]>
  >(async () => []);
  const emailInputRef = useRef<TextInput | null>(null);
  const senhaInputRef = useRef<TextInput | null>(null);
  const aiBehaviorByThreadRef = useRef<Record<string, string>>({});
  const registrarNotificacoesRef = useRef<
    (items: MobileActivityNotification[]) => void
  >(() => undefined);
  const colorScheme = useColorScheme();
  const {
    state: {
      nomeCompletoDraft,
      nomeExibicaoDraft,
      telefoneDraft,
      novoEmailDraft,
      senhaAtualDraft,
      novaSenhaDraft,
      confirmarSenhaDraft,
      planoAtual,
      cartaoAtual,
      nomeAutomaticoConversas,
      fixarConversas,
      provedoresConectados,
      integracoesExternas,
      sessoesAtivas,
      twoFactorEnabled,
      twoFactorMethod,
      recoveryCodesEnabled,
      codigo2FA,
      codigosRecuperacao,
      reautenticacaoStatus,
      reautenticacaoExpiraEm,
      reauthReason,
      filtroEventosSeguranca,
      eventosSeguranca,
      buscaAjuda,
      artigoAjudaExpandidoId,
      filaSuporteLocal,
      ultimaVerificacaoAtualizacao,
      statusAtualizacaoApp,
      feedbackDraft,
      bugDescriptionDraft,
      bugEmailDraft,
      bugAttachmentDraft,
      integracaoSincronizandoId,
    },
    actions: {
      setNomeCompletoDraft,
      setNomeExibicaoDraft,
      setTelefoneDraft,
      setNovoEmailDraft,
      setSenhaAtualDraft,
      setNovaSenhaDraft,
      setConfirmarSenhaDraft,
      setPlanoAtual,
      setCartaoAtual,
      setNomeAutomaticoConversas,
      setFixarConversas,
      setProvedoresConectados,
      setIntegracoesExternas,
      setSessoesAtivas,
      setTwoFactorEnabled,
      setTwoFactorMethod,
      setRecoveryCodesEnabled,
      setCodigo2FA,
      setCodigosRecuperacao,
      setReautenticacaoStatus,
      setReautenticacaoExpiraEm,
      setReauthReason,
      setFiltroEventosSeguranca,
      setEventosSeguranca,
      setBuscaAjuda,
      setArtigoAjudaExpandidoId,
      setFilaSuporteLocal,
      setUltimaVerificacaoAtualizacao,
      setStatusAtualizacaoApp,
      setFeedbackDraft,
      setBugDescriptionDraft,
      setBugEmailDraft,
      setBugAttachmentDraft,
      setIntegracaoSincronizandoId,
      clearTransientSettingsPresentationState,
      resetSessionBoundSettingsPresentationState,
      resetSettingsPresentationAfterAccountDeletion,
    },
  } = useSettingsPresentation();
  const { registrarEventoSegurancaLocal } = useSecurityEventLog({
    setEventosSeguranca,
  });
  const {
    state: {
      settingsDrawerPage,
      settingsDrawerSection,
      settingsSheet,
      settingsSheetLoading,
      settingsSheetNotice,
      confirmSheet,
      confirmTextDraft,
    },
    actions: {
      setConfirmTextDraft,
      setSettingsSheetLoading,
      setSettingsSheetNotice,
      handleAbrirPaginaConfiguracoes,
      handleAbrirSecaoConfiguracoes,
      handleVoltarResumoConfiguracoes,
      abrirSheetConfiguracao,
      fecharSheetConfiguracao,
      abrirConfirmacaoConfiguracao,
      fecharConfirmacaoConfiguracao,
      notificarConfiguracaoConcluida,
      resetSettingsNavigation,
      resetSettingsUi,
      clearTransientSettingsUiPreservingReauth,
    },
  } = useSettingsNavigation();
  const {
    abrirHistorico,
    configuracoesDrawerX,
    drawerOverlayOpacity,
    fecharConfiguracoes,
    fecharHistorico,
    fecharPaineisLaterais,
    handleAbrirConfiguracoes,
    historyDrawerPanResponder,
    historyEdgePanResponder,
    historicoAbertoRef,
    historicoDrawerX,
    resetPainelLateralState,
    settingsDrawerPanResponder,
    settingsEdgePanResponder,
  } = useSidePanelsController({
    configuracoesAberta,
    historicoAberto,
    keyboardHeight,
    resetSettingsNavigation,
    setBuscaHistorico,
    setConfiguracoesAberta,
    setHistoricoAberto,
  });
  const {
    abrirFluxoReautenticacao,
    clearPendingSensitiveAction,
    executarComReautenticacao,
    handleConfirmarSettingsSheetReauth,
    handleExcluirConta,
  } = useSettingsReauthActions({
    abrirConfirmacaoConfiguracao,
    abrirSheetConfiguracao,
    fecharSheetConfiguracao,
    notificarConfiguracaoConcluida,
    registrarEventoSegurancaLocal,
    reautenticacaoExpiraEm,
    settingsSheet,
    reautenticacaoAindaValida,
    setReauthReason,
    setReautenticacaoExpiraEm,
    setReautenticacaoStatus,
    setSettingsSheetLoading,
    setSettingsSheetNotice,
  });
  const {
    state: {
      carregando,
      email,
      entrando,
      erro,
      mostrarSenha,
      senha,
      session,
      statusApi,
    },
    actions: {
      handleLogin,
      handleLogout,
      setCarregando,
      setEmail,
      setMostrarSenha,
      setSenha,
      setSession,
      setStatusApi,
    },
  } = useInspectorSession({
    settingsHydrated,
    chatHistoryEnabled: settingsState.dataControls.chatHistoryEnabled,
    deviceBackupEnabled: settingsState.dataControls.deviceBackupEnabled,
    aplicarPreferenciasLaudos,
    chaveCacheLaudo,
    erroSugereModoOffline,
    lerCacheLeituraLocal,
    lerEstadoHistoricoLocal,
    lerFilaOfflineLocal,
    lerNotificacoesLocais,
    limparCachePorPrivacidade,
    cacheLeituraVazio: CACHE_LEITURA_VAZIO,
    onSetFilaOffline: setFilaOffline,
    onSetNotificacoes: setNotificacoes,
    onSetCacheLeitura: setCacheLeitura,
    onSetLaudosFixadosIds: setLaudosFixadosIds,
    onSetHistoricoOcultoIds: setHistoricoOcultoIds,
    onSetUsandoCacheOffline: setUsandoCacheOffline,
    onSetLaudosDisponiveis: setLaudosDisponiveis,
    onSetConversa: setConversa,
    onSetMensagensMesa: setMensagensMesa,
    onSetLaudoMesaCarregado: setLaudoMesaCarregado,
    onSetErroLaudos: setErroLaudos,
    onApplyBootstrapCache: (bootstrap) => {
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        bootstrap,
        updatedAt: new Date().toISOString(),
      }));
    },
    onAfterLoginSuccess: () => {
      setBloqueioAppAtivo(false);
    },
    onResetAfterLogout: () => {
      setCacheLeitura(CACHE_LEITURA_VAZIO);
      setConversa(null);
      setMensagem("");
      setAnexoRascunho(null);
      setSenha("");
      setAbaAtiva("chat");
      setLaudosDisponiveis([]);
      setErroLaudos("");
      setMensagensMesa([]);
      setErroMesa("");
      setMensagemMesa("");
      setAnexoMesaRascunho(null);
      setFilaOffline([]);
      setSincronizandoFilaOffline(false);
      setSincronizandoItemFilaId("");
      setLaudoMesaCarregado(null);
      setNotificacoes([]);
      setAnexoAbrindoChave("");
      setPreviewAnexoImagem(null);
      resetSessionBoundSettingsPresentationState();
      setBloqueioAppAtivo(false);
      resetSettingsUi();
      clearPendingSensitiveAction();
    },
  });
  const { handleEsqueciSenha, handleLoginSocial, tentarAbrirUrlExterna } =
    useExternalAccessActions({
      email,
      onCanOpenUrl: Linking.canOpenURL,
      onOpenUrl: Linking.openURL,
      onShowAlert: Alert.alert,
    });
  const {
    handleUploadFotoPerfil,
    handleEditarPerfil,
    handleAlterarEmail,
    handleAlterarSenha,
    handleGerenciarPlano,
    handleHistoricoPagamentos,
    handleGerenciarPagamento,
    handleAbrirModeloIa,
    handlePluginsIa,
    handlePermissoes,
    handlePoliticaPrivacidade,
    handleCentralAjuda,
    handleReportarProblema,
    handleEnviarFeedback,
    handleAbrirSobreApp,
    handleAlternarArtigoAjuda,
    handleTermosUso,
    handleLicencas,
  } = useSettingsEntryActions({
    perfilNome,
    perfilExibicao,
    contaTelefone,
    emailAtualConta,
    fallbackEmail: email,
    abrirSheetConfiguracao,
    handleAbrirPaginaConfiguracoes,
    setNomeCompletoDraft,
    setNomeExibicaoDraft,
    setTelefoneDraft,
    setNovoEmailDraft,
    setSenhaAtualDraft,
    setNovaSenhaDraft,
    setConfirmarSenhaDraft,
    setBuscaAjuda,
    setArtigoAjudaExpandidoId,
    setBugDescriptionDraft,
    setBugEmailDraft,
    setBugAttachmentDraft,
    setFeedbackDraft,
  });
  const {
    handleAbrirAjustesDoSistema,
    handleCompartilharCodigosRecuperacao,
    handleConectarProximoProvedorDisponivel,
    handleConfirmarCodigo2FA,
    handleEncerrarOutrasSessoes,
    handleEncerrarSessao,
    handleEncerrarSessaoAtual,
    handleEncerrarSessoesSuspeitas,
    handleGerarCodigosRecuperacao,
    handleMudarMetodo2FA,
    handleReautenticacaoSensivel,
    handleRevisarSessao,
    handleToggle2FA,
    handleToggleBiometriaNoDispositivo,
    handleToggleProviderConnection,
  } = useSettingsSecurityActions({
    biometriaLocalSuportada,
    biometriaPermitida,
    codigosRecuperacao,
    codigo2FA,
    emailAtualConta,
    fallbackEmail: email,
    fecharConfiguracoes,
    handleLogout,
    provedoresConectados,
    reautenticacaoExpiraEm,
    requireAuthOnOpen,
    sessoesAtivas,
    twoFactorEnabled,
    twoFactorMethod,
    abrirConfirmacaoConfiguracao,
    abrirFluxoReautenticacao,
    abrirSheetConfiguracao,
    compartilharTextoExportado,
    executarComReautenticacao,
    openSystemSettings: () => {
      void Linking.openSettings();
    },
    registrarEventoSegurancaLocal,
    reautenticacaoAindaValida,
    setCodigo2FA,
    setCodigosRecuperacao,
    setDeviceBiometricsEnabled,
    setProvedoresConectados,
    setRequireAuthOnOpen,
    setSessoesAtivas,
    setSettingsSheetNotice,
    setTwoFactorEnabled,
    setTwoFactorMethod,
    showAlert: Alert.alert,
  });

  const {
    actions: {
      carregarMesaAtual,
      definirReferenciaMesaAtiva,
      handleEnviarMensagemMesa,
      limparReferenciaMesaAtiva,
      resetMesaState,
    },
  } = useMesaController<OfflinePendingMessage, MobileReadCache>({
    session,
    activeThread: abaAtiva,
    conversation: conversa,
    statusApi,
    wifiOnlySync,
    messageMesa: mensagemMesa,
    attachmentDraft: anexoMesaRascunho,
    activeReference: mensagemMesaReferenciaAtiva,
    messagesMesa: mensagensMesa,
    setMessagesMesa: setMensagensMesa,
    setErrorMesa: setErroMesa,
    setMessageMesa: setMensagemMesa,
    setAttachmentDraft: setAnexoMesaRascunho,
    setActiveReference: setMensagemMesaReferenciaAtiva,
    setLoadingMesa: setCarregandoMesa,
    setSyncMesa: setSincronizandoMesa,
    setSendingMesa: setEnviandoMesa,
    laudoMesaCarregado,
    setLaudoMesaCarregado,
    scrollRef,
    carregarListaLaudosRef,
    setFilaOffline,
    setStatusApi,
    cacheLeitura,
    setCacheLeitura,
    setUsandoCacheOffline,
    setConversation: setConversa,
    chaveCacheLaudo,
    chaveRascunho,
    erroSugereModoOffline,
    textoFallbackAnexo,
    criarItemFilaOffline,
    atualizarResumoLaudoAtual,
  });

  const {
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
    },
  } = useInspectorChatController<OfflinePendingMessage, MobileReadCache>({
    session,
    sessionLoading: carregando,
    activeThread: abaAtiva,
    statusApi,
    wifiOnlySync,
    aiRequestConfig,
    speechSettings: settingsState.speech,
    cacheLeitura,
    conversation: conversa,
    setConversation: setConversa,
    laudosDisponiveis,
    setLaudosDisponiveis,
    laudosFixadosIds,
    historicoOcultoIds,
    laudoMesaCarregado,
    setLaudoMesaCarregado,
    setMensagensMesa,
    setErroMesa,
    setMensagemMesa,
    setAnexoMesaRascunho,
    clearMesaReference: limparReferenciaMesaAtiva,
    onSetActiveThread: setAbaAtiva,
    message: mensagem,
    setMessage: setMensagem,
    attachmentDraft: anexoRascunho,
    setAttachmentDraft: setAnexoRascunho,
    setErrorConversation: setErroConversa,
    setSendingMessage: setEnviandoMensagem,
    setLoadingConversation: setCarregandoConversa,
    setSyncConversation: setSincronizandoConversa,
    setLoadingLaudos: setCarregandoLaudos,
    setErrorLaudos: setErroLaudos,
    highlightedMessageId: mensagemChatDestacadaId,
    setHighlightedMessageId: setMensagemChatDestacadaId,
    layoutVersion: layoutMensagensChatVersao,
    setLayoutVersion: setLayoutMensagensChatVersao,
    scrollRef,
    setFilaOffline,
    setStatusApi,
    setUsandoCacheOffline,
    setCacheLeitura,
    carregarMesaAtual,
    aplicarPreferenciasLaudos,
    chaveCacheLaudo,
    chaveRascunho,
    erroSugereModoOffline,
    normalizarConversa,
    atualizarResumoLaudoAtual,
    criarConversaNova,
    podeEditarConversaNoComposer,
    textoFallbackAnexo,
    normalizarModoChat,
    inferirSetorConversa,
    montarHistoricoParaEnvio,
    criarMensagemAssistenteServidor,
    criarItemFilaOffline,
  });
  carregarListaLaudosRef.current = carregarListaLaudos;
  const { handleAbrirAnexo, handleAbrirSeletorAnexo, handleEscolherAnexo } =
    useAttachmentController({
      abaAtiva,
      arquivosPermitidos,
      autoUploadAttachments,
      cameraPermitida,
      preparandoAnexo,
      sessionAccessToken: session?.accessToken || null,
      statusApi,
      uploadArquivosAtivo,
      wifiOnlySync,
      imageQuality: attachmentHandlingPolicy.imageQuality,
      disableAggressiveDownloads:
        attachmentHandlingPolicy.disableAggressiveDownloads,
      erroSugereModoOffline,
      inferirExtensaoAnexo,
      montarAnexoDocumentoLocal,
      montarAnexoDocumentoMesa,
      montarAnexoImagem,
      nomeArquivoSeguro,
      onBuildAttachmentKey: chaveAnexo,
      onShowAlert: Alert.alert,
      setAnexosAberto,
      setAnexoAbrindoChave,
      setAnexoMesaRascunho,
      setAnexoRascunho,
      setErroConversa,
      setPreparandoAnexo,
      setPreviewAnexoImagem,
      setStatusApi,
    });
  const {
    handleAbrirAjudaDitado,
    handleVoiceInputPress,
    onCyclePreferredVoice,
  } = useVoiceInputController({
    entradaPorVoz,
    microfonePermitido,
    preferredVoiceId,
    speechEnabled,
    voiceInputUnavailableMessage:
      buildVoiceInputUnavailableMessage(voiceLanguage),
    voiceRuntimeSupported: voiceRuntimeState.sttSupported,
    voices: voiceRuntimeState.voices,
    onOpenSystemSettings: () => {
      void Linking.openSettings();
    },
    onSetMicrofonePermitido: setMicrofonePermitido,
    onSetPreferredVoiceId: setPreferredVoiceId,
    onShowAlert: Alert.alert,
  });
  const {
    handleAbrirHistorico,
    handleExcluirConversaHistorico,
    handleGerenciarConversasIndividuais,
    handleSelecionarHistorico,
  } = useHistoryController<
    ChatState,
    MobileReadCache,
    MobileMesaMessage,
    MobileActivityNotification
  >({
    keyboardHeight,
    historicoAberto,
    historicoAbertoRefAtual: historicoAbertoRef.current,
    conversaAtualLaudoId: conversa?.laudoId ?? null,
    fecharHistorico,
    abrirHistorico,
    fecharConfiguracoes,
    handleSelecionarLaudo,
    onCreateNewConversation: criarConversaNova,
    onDismissKeyboard: Keyboard.dismiss,
    onGetCacheKeyForLaudo: chaveCacheLaudo,
    onSchedule: (callback, delayMs) => {
      setTimeout(callback, delayMs);
    },
    setAbaAtiva,
    setAnexoMesaRascunho,
    setAnexoRascunho,
    setCacheLeitura,
    setConversa,
    setErroConversa,
    setErroMesa,
    setHistoricoOcultoIds,
    setLaudoMesaCarregado,
    setLaudosDisponiveis,
    setLaudosFixadosIds,
    setMensagem,
    setMensagemMesa,
    setMensagensMesa,
    setNotificacoes,
  });

  const {
    actions: {
      handleRetomarItemFilaOffline,
      removerItemFilaOffline,
      sincronizarFilaOffline,
      sincronizarItemFilaOffline,
    },
  } = useOfflineQueueController<ChatState, OfflinePendingMessage>({
    session,
    sessionLoading: carregando,
    statusApi,
    wifiOnlySync,
    syncEnabled: sincronizacaoDispositivos,
    activeThread: abaAtiva,
    conversation: conversa,
    messagesMesa: mensagensMesa,
    offlineQueue: filaOffline,
    syncingQueue: sincronizandoFilaOffline,
    syncingItemId: sincronizandoItemFilaId,
    setOfflineQueue: setFilaOffline,
    setSyncingQueue: setSincronizandoFilaOffline,
    setSyncingItemId: setSincronizandoItemFilaId,
    setOfflineQueueVisible: setFilaOfflineAberta,
    setActiveThread: setAbaAtiva,
    setMessage: setMensagem,
    setAttachmentDraft: setAnexoRascunho,
    setMessageMesa: setMensagemMesa,
    setAttachmentMesaDraft: setAnexoMesaRascunho,
    setMesaActiveReference: setMensagemMesaReferenciaAtiva,
    setErrorConversation: setErroConversa,
    setErrorMesa: setErroMesa,
    setStatusApi,
    saveQueueLocally: salvarFilaOfflineLocal,
    carregarListaLaudos,
    carregarConversaAtual,
    abrirLaudoPorId,
    handleSelecionarLaudo,
    carregarMesaAtual,
    inferirSetorConversa,
    montarHistoricoParaEnvio,
    normalizarModoChat,
    obterResumoReferenciaMensagem,
    erroSugereModoOffline,
    duplicarComposerAttachment,
    calcularBackoffMs: calcularBackoffPendenciaOfflineMs,
    isItemReadyForRetry: pendenciaFilaProntaParaReenvio,
  });
  const handleRefresh = buildRefreshAction({
    abaAtiva,
    carregarConversaAtual,
    carregarListaLaudos,
    carregarMesaAtual,
    conversa,
    criarNotificacaoSistema,
    filaOffline,
    onCanSyncOnCurrentNetwork: podeSincronizarNaRedeAtual,
    onIsOfflineItemReadyForRetry: pendenciaFilaProntaParaReenvio,
    onPingApi: pingApi,
    onRegistrarNotificacoes: (items) => {
      registrarNotificacoesRef.current(items);
    },
    onSetErroConversa: setErroConversa,
    onSetErroMesa: setErroMesa,
    onSetSincronizandoAgora: setSincronizandoAgora,
    onSetStatusApi: setStatusApi,
    onSetUsandoCacheOffline: setUsandoCacheOffline,
    session,
    sincronizacaoDispositivos,
    sincronizarFilaOffline,
    wifiOnlySync,
  });

  const {
    state: { monitorandoAtividade },
    actions: {
      handleAbrirCentralAtividade,
      handleAbrirNotificacao,
      registrarNotificacoes,
    },
  } = useActivityCenterController<ChatState, MobileActivityNotification>({
    session,
    sessionLoading: carregando,
    statusApi,
    wifiOnlySync,
    syncEnabled: sincronizacaoDispositivos,
    activeThread: abaAtiva,
    conversation: conversa,
    laudosDisponiveis,
    laudoMesaCarregado,
    messagesMesa: mensagensMesa,
    monitorIntervalMs: obterIntervaloMonitoramentoMs(economiaDados, usoBateria),
    notifications: notificacoes,
    notificationSettings: settingsState.notifications,
    notificationsPermissionGranted: notificacoesPermitidas,
    setNotifications: setNotificacoes,
    setActivityCenterVisible: setCentralAtividadeAberta,
    openLaudoById: abrirLaudoPorId,
    setActiveThread: setAbaAtiva,
    carregarMesaAtual,
    onRecoverOnline: handleRefresh,
    saveNotificationsLocally: salvarNotificacoesLocais,
    assinaturaStatusLaudo,
    assinaturaMensagemMesa,
    selecionarLaudosParaMonitoramentoMesa,
    criarNotificacaoStatusLaudo,
    criarNotificacaoMesa,
    erroSugereModoOffline,
    chaveCacheLaudo,
    onUpdateCurrentConversationSummary: (payload) => {
      setConversa((estadoAtual) =>
        atualizarResumoLaudoAtual(estadoAtual, payload),
      );
    },
    onSetLaudosDisponiveis: setLaudosDisponiveis,
    onSetCacheLaudos: (proximosLaudos) => {
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        laudos: proximosLaudos,
        updatedAt: new Date().toISOString(),
      }));
    },
    onSetErroLaudos: setErroLaudos,
    onSetMensagensMesa: setMensagensMesa,
    onSetLaudoMesaCarregado: setLaudoMesaCarregado,
    onSetCacheMesa: (cacheMesaAtualizado) => {
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        mesaPorLaudo: {
          ...estadoAtual.mesaPorLaudo,
          ...cacheMesaAtualizado,
        },
        updatedAt: new Date().toISOString(),
      }));
    },
    onSetStatusApi: setStatusApi,
    onSetErroConversaIfEmpty: (message) => {
      setErroConversa((estadoAtual) => estadoAtual || message);
    },
    maxNotifications: MAX_NOTIFICATIONS,
  });
  const {
    actions: {
      handleAbrirPermissaoNotificacoes,
      handleDesbloquearAplicativo,
      handleGerenciarPermissao,
    },
  } = useAppLockController({
    appLocked: bloqueioAppAtivo,
    session,
    settingsHydrated,
    requireAuthOnOpen,
    lockTimeout,
    reauthenticationExpiresAt: reautenticacaoExpiraEm,
    deviceBiometricsEnabled,
    microphonePermissionGranted: microfonePermitido,
    cameraPermissionGranted: cameraPermitida,
    filesPermissionGranted: arquivosPermitidos,
    notificationsPermissionGranted: notificacoesPermitidas,
    biometricsPermissionGranted: biometriaPermitida,
    pushEnabled: notificaPush,
    uploadFilesEnabled: uploadArquivosAtivo,
    voiceInputEnabled: entradaPorVoz,
    setMicrophonePermissionGranted: setMicrofonePermitido,
    setCameraPermissionGranted: setCameraPermitida,
    setFilesPermissionGranted: setArquivosPermitidos,
    setNotificationsPermissionGranted: setNotificacoesPermitidas,
    setBiometricsPermissionGranted: setBiometriaPermitida,
    setPushEnabled: setNotificaPush,
    setDeviceBiometricsEnabled,
    setUploadFilesEnabled: setUploadArquivosAtivo,
    setVoiceInputEnabled: setEntradaPorVoz,
    setAppLocked: setBloqueioAppAtivo,
    isReauthenticationStillValid: reautenticacaoAindaValida,
    resolveLockTimeoutMs: obterTimeoutBloqueioMs,
    openReauthFlow: abrirFluxoReautenticacao,
    registerSecurityEvent: registrarEventoSegurancaLocal,
  });

  useEffect(() => {
    if (!session) {
      return;
    }

    settingsActions.updateWith((current) =>
      mergeMobileUserIntoSettings(current, session.bootstrap.usuario),
    );
    setProvedoresConectados((estadoAtual) =>
      estadoAtual.map((provider) =>
        provider.connected && !provider.email && session.bootstrap.usuario.email
          ? { ...provider, email: session.bootstrap.usuario.email }
          : provider,
      ),
    );
  }, [email, session, settingsActions]);

  const snapshotConfiguracoesCriticasAtuais = useMemo(
    () => settingsToCriticalSnapshot(settingsState),
    [settingsState],
  );

  useCriticalSettingsSync({
    accessToken: session?.accessToken,
    carregando,
    snapshotAtual: snapshotConfiguracoesCriticasAtuais,
    aplicarSnapshot: (snapshot) => {
      settingsActions.updateWith((current) =>
        mergeCriticalSnapshotIntoSettings(current, snapshot),
      );
    },
    onLoadError: (error) => {
      console.warn(
        "Falha ao carregar configuracoes criticas da conta no backend.",
        error,
      );
    },
    onSaveError: (error) => {
      console.warn(
        "Falha ao sincronizar configuracoes criticas da conta no backend.",
        error,
      );
    },
  });
  registrarNotificacoesRef.current = registrarNotificacoes;

  useEffect(() => {
    configureObservability({ analyticsOptIn });
  }, [analyticsOptIn]);

  useEffect(() => {
    configureCrashReports({ enabled: crashReportsOptIn });
  }, [crashReportsOptIn]);

  useEffect(() => {
    let ativo = true;
    void loadVoiceRuntimeState(voiceLanguage).then((runtime) => {
      if (!ativo) {
        return;
      }
      setVoiceRuntimeState(runtime);
      if (
        preferredVoiceId &&
        !runtime.voices.some((voice) => voice.identifier === preferredVoiceId)
      ) {
        setPreferredVoiceId("");
      }
    });
    return () => {
      ativo = false;
    };
  }, [preferredVoiceId, voiceLanguage]);

  useEffect(() => {
    const threadKey = chaveCacheLaudo(conversa?.laudoId ?? null);
    const previousSummary = aiBehaviorByThreadRef.current[threadKey] || "";
    const nextSummary = aiRequestConfig.summaryLabel;
    setChatAiBehaviorNotice(
      describeChatAiBehaviorChange(previousSummary, nextSummary),
    );
    aiBehaviorByThreadRef.current[threadKey] = nextSummary;
  }, [aiRequestConfig.summaryLabel, conversa?.laudoId]);

  useEffect(() => {
    if (carregando) {
      return;
    }
    void salvarEstadoHistoricoLocal({
      laudosFixadosIds,
      historicoOcultoIds,
    });
  }, [carregando, historicoOcultoIds, laudosFixadosIds]);

  useEffect(() => {
    if (carregando) {
      return;
    }
    if (!backupAutomatico) {
      void salvarCacheLeituraLocal(CACHE_LEITURA_VAZIO);
      return;
    }
    void salvarCacheLeituraLocal(
      salvarHistoricoConversas
        ? cacheLeitura
        : limparCachePorPrivacidade(cacheLeitura),
    );
  }, [backupAutomatico, cacheLeitura, carregando, salvarHistoricoConversas]);

  useEffect(() => {
    if (carregando || salvarHistoricoConversas) {
      return;
    }

    setCacheLeitura((estadoAtual) => {
      const possuiHistorico =
        Boolean(estadoAtual.conversaAtual) ||
        estadoAtual.laudos.length > 0 ||
        Object.keys(estadoAtual.conversasPorLaudo).length > 0 ||
        Object.keys(estadoAtual.mesaPorLaudo).length > 0 ||
        Object.keys(estadoAtual.chatDrafts).length > 0 ||
        Object.keys(estadoAtual.mesaDrafts).length > 0 ||
        Object.keys(estadoAtual.chatAttachmentDrafts).length > 0 ||
        Object.keys(estadoAtual.mesaAttachmentDrafts).length > 0;

      if (!possuiHistorico) {
        return estadoAtual;
      }

      return limparCachePorPrivacidade(estadoAtual);
    });
  }, [carregando, salvarHistoricoConversas]);

  useEffect(() => {
    if (!reautenticacaoExpiraEm) {
      if (reautenticacaoStatus !== "Não confirmada") {
        setReautenticacaoStatus("Não confirmada");
      }
      return;
    }

    if (!reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
      setReautenticacaoExpiraEm("");
      setReautenticacaoStatus("Não confirmada");
      return;
    }

    setReautenticacaoStatus(
      formatarStatusReautenticacao(reautenticacaoExpiraEm),
    );
    const timeout = setTimeout(
      () => {
        setReautenticacaoExpiraEm("");
        setReautenticacaoStatus("Não confirmada");
      },
      Math.max(0, new Date(reautenticacaoExpiraEm).getTime() - Date.now()),
    );

    return () => clearTimeout(timeout);
  }, [reautenticacaoExpiraEm, reautenticacaoStatus]);

  useEffect(() => {
    const janelaMs = obterJanelaRetencaoMs(retencaoDados);
    if (!janelaMs) {
      return;
    }

    setNotificacoes((estadoAtual) =>
      filtrarItensPorRetencao(estadoAtual, janelaMs, (item) => item.createdAt),
    );
    setFilaSuporteLocal((estadoAtual) =>
      filtrarItensPorRetencao(estadoAtual, janelaMs, (item) => item.createdAt),
    );
    setFilaOffline((estadoAtual) =>
      filtrarItensPorRetencao(estadoAtual, janelaMs, (item) => item.createdAt),
    );
    setLaudosDisponiveis((estadoAtual) =>
      filtrarItensPorRetencao(estadoAtual, janelaMs, (item) => item.data_iso),
    );
    setCacheLeitura((estadoAtual) => {
      const laudosFiltrados = filtrarItensPorRetencao(
        estadoAtual.laudos,
        janelaMs,
        (item) => item.data_iso,
      );
      const idsPermitidos = new Set(
        laudosFiltrados.map((item) => chaveCacheLaudo(item.id)),
      );
      const filtrarPorIds = <T,>(mapa: Record<string, T>): Record<string, T> =>
        Object.fromEntries(
          Object.entries(mapa).filter(([chave]) => idsPermitidos.has(chave)),
        );
      const conversaAtualValida =
        estadoAtual.conversaAtual?.laudoId &&
        !idsPermitidos.has(chaveCacheLaudo(estadoAtual.conversaAtual.laudoId))
          ? null
          : estadoAtual.conversaAtual;

      return {
        ...estadoAtual,
        laudos: laudosFiltrados,
        conversaAtual: conversaAtualValida,
        conversasPorLaudo: filtrarPorIds(estadoAtual.conversasPorLaudo),
        mesaPorLaudo: filtrarPorIds(estadoAtual.mesaPorLaudo),
        chatDrafts: filtrarPorIds(estadoAtual.chatDrafts),
        mesaDrafts: filtrarPorIds(estadoAtual.mesaDrafts),
        chatAttachmentDrafts: filtrarPorIds(estadoAtual.chatAttachmentDrafts),
        mesaAttachmentDrafts: filtrarPorIds(estadoAtual.mesaAttachmentDrafts),
      };
    });
  }, [retencaoDados]);

  useEffect(() => {
    if (!bloqueioAppAtivo) {
      return;
    }
    setAnexosAberto(false);
    setCentralAtividadeAberta(false);
    setFilaOfflineAberta(false);
    setPreviewAnexoImagem(null);
    clearTransientSettingsUiPreservingReauth();
    fecharPaineisLaterais();
  }, [bloqueioAppAtivo]);

  useEffect(() => {
    if (session || carregando) {
      return;
    }

    setAbaAtiva("chat");
    resetMesaState();
    setAnexoAbrindoChave("");
    setPreviewAnexoImagem(null);
    clearTransientSettingsPresentationState();
    setUsandoCacheOffline(false);
    setCentralAtividadeAberta(false);
    resetPainelLateralState();
  }, [carregando, session]);

  useEffect(() => {
    if (carregando || !session) {
      return;
    }

    setCacheLeitura((estadoAtual) => {
      const possuiRascunhos =
        Object.keys(estadoAtual.chatDrafts).length > 0 ||
        Object.keys(estadoAtual.mesaDrafts).length > 0 ||
        Object.keys(estadoAtual.chatAttachmentDrafts).length > 0 ||
        Object.keys(estadoAtual.mesaAttachmentDrafts).length > 0;
      if (!possuiRascunhos) {
        return estadoAtual;
      }
      return {
        ...estadoAtual,
        chatDrafts: {},
        mesaDrafts: {},
        chatAttachmentDrafts: {},
        mesaAttachmentDrafts: {},
        updatedAt: new Date().toISOString(),
      };
    });
  }, [carregando, session]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!session || keyboardHeight <= 0) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);

    return () => clearTimeout(timeout);
  }, [keyboardHeight, session]);

  const {
    accentColor,
    appGradientColors,
    artigosAjudaFiltrados,
    chatKeyboardVerticalOffset,
    contaEmailLabel,
    contaTelefoneLabel,
    conversaAtiva,
    conversaVazia,
    conversasOcultasTotal,
    conversasVisiveisTotal,
    corDestaqueResumoConfiguracao,
    dynamicComposerInputStyle,
    dynamicMessageBubbleStyle,
    dynamicMessageTextStyle,
    eventosSegurancaFiltrados,
    existeProvedorDisponivel,
    filaOfflineFiltrada,
    filaOfflineOrdenada,
    filtrosFilaOffline,
    fontScale,
    headerSafeTopInset,
    historicoAgrupadoFinal,
    historicoVazioTexto,
    historicoVazioTitulo,
    iniciaisPerfilConfiguracao,
    integracoesConectadasTotal,
    integracoesDisponiveisTotal,
    keyboardAvoidingBehavior,
    keyboardVisible,
    laudoSelecionadoId,
    loginKeyboardBottomPadding,
    loginKeyboardVerticalOffset,
    mesaDisponivel,
    mesaTemMensagens,
    mensagensVisiveis,
    mostrarGrupoContaAcesso,
    mostrarGrupoExperiencia,
    mostrarGrupoSeguranca,
    mostrarGrupoSistema,
    nomeUsuarioExibicao,
    outrasSessoesAtivas,
    perfilExibicaoLabel,
    perfilNomeCompleto,
    permissoesNegadasTotal,
    planoResumoConfiguracao,
    podeAbrirAnexosChat,
    podeAbrirAnexosMesa,
    podeAcionarComposer,
    podeEnviarComposer,
    podeEnviarMesa,
    podeSincronizarFilaOffline,
    podeUsarComposerMesa,
    previewPrivacidadeNotificacao,
    provedoresConectadosTotal,
    provedorPrimario,
    resumo2FAFootnote,
    resumo2FAStatus,
    resumoAlertaMetodosConta,
    resumoAtualizacaoApp,
    resumoBlindagemSessoes,
    resumoContaAcesso,
    resumoCodigosRecuperacao,
    resumoDadosConversas,
    resumoExcluirConta,
    resumoFilaOffline,
    resumoFilaOfflineFiltrada,
    resumoFilaSuporteLocal,
    resumoMetodosConta,
    resumoPermissoes,
    resumoPermissoesCriticas,
    resumoPrivacidadeNotificacoes,
    resumoSessaoAtual,
    resumoSuporteApp,
    sessaoAtual,
    settingsDrawerInOverview,
    settingsDrawerMatchesPage,
    settingsDrawerMatchesSection,
    settingsDrawerPageSections,
    settingsDrawerSectionMenuAtiva,
    settingsDrawerSubtitle,
    settingsDrawerTitle,
    settingsPrintDarkMode,
    sessoesSuspeitasTotal,
    temaResumoConfiguracao,
    temPrioridadesConfiguracao,
    threadKeyboardPaddingBottom,
    ticketsBugTotal,
    ticketsFeedbackTotal,
    tipoTemplateAtivoLabel,
    totalSecoesConfiguracaoVisiveis,
    ultimaVerificacaoAtualizacaoLabel,
    ultimoEventoProvedor,
    ultimoEventoSessao,
    ultimoTicketSuporteResumo,
    ultimoTicketSuporte,
    vendoMesa,
    workspaceResumoConfiguracao,
    notificacoesNaoLidas,
    placeholderComposer,
    placeholderMesa,
  } = buildInspectorBaseDerivedState(
    buildInspectorBaseDerivedStateInput({
      shell: {
        abaAtiva,
        buscaAjuda,
        buscaConfiguracoes,
        colorScheme,
        filtroConfiguracoes,
        keyboardHeight,
        session,
        statusApi,
        statusAtualizacaoApp,
        ultimaVerificacaoAtualizacao,
      },
      chat: {
        anexoMesaRascunho,
        anexoRascunho,
        carregandoConversa,
        carregandoMesa,
        conversa,
        enviandoMensagem,
        enviandoMesa,
        mensagem,
        mensagemMesa,
        mensagensMesa,
        preparandoAnexo,
      },
      historyAndOffline: {
        buscaHistorico,
        eventosSeguranca,
        filaOffline,
        filaSuporteLocal,
        filtroEventosSeguranca,
        filtroFilaOffline,
        filtroHistorico,
        fixarConversas,
        historicoOcultoIds,
        laudosDisponiveis,
        notificacoes,
        pendenciaFilaProntaParaReenvio,
        prioridadePendenciaOffline,
      },
      settingsAndAccount: {
        arquivosPermitidos,
        biometriaPermitida,
        cameraPermitida,
        codigosRecuperacao,
        corDestaque,
        contaTelefone,
        densidadeInterface,
        email,
        emailAtualConta,
        estiloResposta,
        idiomaResposta,
        integracoesExternas,
        lockTimeout,
        microfonePermitido,
        modeloIa,
        mostrarConteudoNotificacao,
        mostrarSomenteNovaMensagem,
        notificacoesPermitidas,
        ocultarConteudoBloqueado,
        perfilExibicao,
        perfilNome,
        planoAtual,
        provedoresConectados,
        reautenticacaoStatus,
        recoveryCodesEnabled,
        salvarHistoricoConversas,
        settingsDrawerPage,
        settingsDrawerSection,
        sessoesAtivas,
        somNotificacao,
        sincronizacaoDispositivos,
        tamanhoFonte,
        temaApp,
        twoFactorEnabled,
        twoFactorMethod,
        uploadArquivosAtivo,
      },
      helpers: {
        buildHistorySections,
        formatarHorarioAtividade,
        formatarTipoTemplateLaudo,
        obterEscalaDensidade,
        obterEscalaFonte,
        podeEditarConversaNoComposer,
        previewChatLiberadoParaConversa,
      },
    }),
  );
  const canalSuporteUrl = construirUrlCanalSuporte(
    session?.bootstrap.app.suporte_whatsapp || "",
  );
  const canalSuporteLabel = canalSuporteUrl ? "WhatsApp" : "Canal indisponível";
  const apiEnvironmentLabel = (() => {
    const raw = session?.bootstrap.app.api_base_url || API_BASE_URL;
    try {
      const parsed = new URL(raw);
      return parsed.host || raw;
    } catch {
      return raw;
    }
  })();
  const preferredVoice =
    voiceRuntimeState.voices.find(
      (voice) => voice.identifier === preferredVoiceId,
    ) ||
    voiceRuntimeState.voices[0] ||
    null;
  const preferredVoiceLabel =
    preferredVoice?.name ||
    (voiceRuntimeState.ttsSupported ? "Padrão do sistema" : "Indisponível");
  const resumoCentralAtividade = !notificacoes.length
    ? "Sem eventos"
    : notificacoesNaoLidas
      ? `${notificacoesNaoLidas} nova(s)`
      : `${notificacoes.length} evento(s)`;
  const resumoCache = limpandoCache
    ? "Limpando..."
    : ultimaLimpezaCacheEm
      ? `Limpo ${formatarHorarioAtividade(ultimaLimpezaCacheEm)}`
      : cacheLeitura.updatedAt
        ? `Atualizado ${formatarHorarioAtividade(cacheLeitura.updatedAt)}`
        : "Sem cache local";
  const sincronizandoDados =
    sincronizandoAgora ||
    sincronizandoConversa ||
    sincronizandoMesa ||
    carregandoLaudos ||
    sincronizandoFilaOffline;
  const {
    handleAbrirCanalSuporte,
    handleAlternarIntegracaoExterna,
    handleApagarHistoricoConfiguracoes,
    handleDetalhesSegurancaArquivos,
    handleExportarDiagnosticoApp,
    handleLimparCache,
    handleLimparFilaSuporteLocal,
    handleRemoverScreenshotBug,
    handleSelecionarScreenshotBug,
    handleSincronizarIntegracaoExterna,
    handleSolicitarLogout,
    handleVerificarAtualizacoes,
  } = useSettingsOperationsActions<MobileReadCache>({
    appRuntime,
    cacheLeituraVazio: CACHE_LEITURA_VAZIO,
    canalSuporteUrl,
    emailAtualConta,
    eventosSeguranca,
    executarComReautenticacao,
    fallbackEmail: email,
    fecharConfiguracoes,
    filaOfflineTotal: filaOffline.length,
    filaSuporteLocal,
    formatarHorarioAtividade,
    handleLogout,
    integracaoSincronizandoId,
    integracoesExternas,
    limpandoCache,
    microfonePermitido,
    cameraPermitida,
    arquivosPermitidos,
    notificacoesPermitidas,
    abrirConfirmacaoConfiguracao,
    abrirSheetConfiguracao,
    perfilExibicao,
    perfilNome,
    registrarEventoSegurancaLocal,
    resumoAtualizacaoApp: statusAtualizacaoApp,
    sessaoAtualTitulo:
      sessoesAtivas.find((item) => item.current)?.title || "Dispositivo atual",
    setBugAttachmentDraft,
    setCacheLeitura,
    setFilaSuporteLocal,
    setIntegracaoSincronizandoId,
    setIntegracoesExternas,
    setLimpandoCache,
    setSettingsSheetNotice,
    setStatusApi,
    setStatusAtualizacaoApp,
    setUltimaLimpezaCacheEm,
    setUltimaVerificacaoAtualizacao,
    setVerificandoAtualizacoes,
    compartilharTextoExportado,
    statusApi,
    statusAtualizacaoApp,
    tentarAbrirUrlExterna,
    ultimaVerificacaoAtualizacao,
    verificandoAtualizacoes,
    showAlert: Alert.alert,
    onNotificarSistema: (params) => {
      registrarNotificacoes([criarNotificacaoSistema(params)]);
    },
    montarScreenshotAnexo: (asset) =>
      montarAnexoImagem(
        asset,
        "Screenshot anexada ao relato de bug para facilitar a reprodução.",
      ),
  });
  const executarExclusaoContaLocal = buildAccountDeletionAction({
    fecharConfiguracoes,
    handleLogout,
    onResetSettingsPresentationAfterAccountDeletion:
      resetSettingsPresentationAfterAccountDeletion,
    onSetAppLoading: setCarregando,
    onSetAprendizadoIa: setAprendizadoIa,
    onSetAnimacoesAtivas: setAnimacoesAtivas,
    onSetArquivosPermitidos: setArquivosPermitidos,
    onSetAutoUploadAttachments: setAutoUploadAttachments,
    onSetBackupAutomatico: setBackupAutomatico,
    onSetBiometriaPermitida: setBiometriaPermitida,
    onSetCameraPermitida: setCameraPermitida,
    onSetChatCategoryEnabled: setChatCategoryEnabled,
    onSetCompartilharMelhoriaIa: setCompartilharMelhoriaIa,
    onSetCorDestaque: setCorDestaque,
    onSetCriticalAlertsEnabled: setCriticalAlertsEnabled,
    onSetDensidadeInterface: setDensidadeInterface,
    onSetDeviceBiometricsEnabled: setDeviceBiometricsEnabled,
    onSetEconomiaDados: setEconomiaDados,
    onSetEmail: setEmail,
    onSetEmailAtualConta: setEmailAtualConta,
    onSetEmailsAtivos: setEmailsAtivos,
    onSetEntradaPorVoz: setEntradaPorVoz,
    onSetEstiloResposta: setEstiloResposta,
    onSetFixarConversas: setFixarConversas,
    onSetHideInMultitask: setHideInMultitask,
    onSetHistoricoOcultoIds: setHistoricoOcultoIds,
    onSetIdiomaApp: setIdiomaApp,
    onSetIdiomaResposta: setIdiomaResposta,
    onSetLaudosFixadosIds: setLaudosFixadosIds,
    onSetLockTimeout: setLockTimeout,
    onSetMediaCompression: setMediaCompression,
    onSetMemoriaIa: setMemoriaIa,
    onSetMesaCategoryEnabled: setMesaCategoryEnabled,
    onSetMicrofonePermitido: setMicrofonePermitido,
    onSetModeloIa: setModeloIa,
    onSetMostrarConteudoNotificacao: setMostrarConteudoNotificacao,
    onSetMostrarSomenteNovaMensagem: setMostrarSomenteNovaMensagem,
    onSetNomeAutomaticoConversas: setNomeAutomaticoConversas,
    onSetNotificaPush: setNotificaPush,
    onSetNotificaRespostas: setNotificaRespostas,
    onSetNotificacoesPermitidas: setNotificacoesPermitidas,
    onSetOcultarConteudoBloqueado: setOcultarConteudoBloqueado,
    onSetPerfilExibicao: setPerfilExibicao,
    onSetPerfilFotoHint: setPerfilFotoHint,
    onSetPerfilFotoUri: setPerfilFotoUri,
    onSetPerfilNome: setPerfilNome,
    onSetPreferredVoiceId: setPreferredVoiceId,
    onSetRegiaoApp: setRegiaoApp,
    onSetRequireAuthOnOpen: setRequireAuthOnOpen,
    onSetRespostaPorVoz: setRespostaPorVoz,
    onSetRetencaoDados: setRetencaoDados,
    onSetSalvarHistoricoConversas: setSalvarHistoricoConversas,
    onSetSincronizacaoDispositivos: setSincronizacaoDispositivos,
    onSetSomNotificacao: setSomNotificacao,
    onSetSpeechRate: setSpeechRate,
    onSetSystemCategoryEnabled: setSystemCategoryEnabled,
    onSetTamanhoFonte: setTamanhoFonte,
    onSetTemperaturaIa: setTemperaturaIa,
    onSetTemaApp: setTemaApp,
    onSetTomConversa: setTomConversa,
    onSetUploadArquivosAtivo: setUploadArquivosAtivo,
    onSetUsoBateria: setUsoBateria,
    onSetVibracaoAtiva: setVibracaoAtiva,
    onSetVoiceLanguage: setVoiceLanguage,
    onShowAlert: Alert.alert,
  });
  const handleConfirmarSettingsSheet = buildSettingsSheetConfirmAction({
    bugAttachmentDraft,
    bugDescriptionDraft,
    bugEmailDraft,
    cartaoAtual,
    confirmarSenhaDraft,
    compartilharTextoExportado,
    contaTelefone,
    email,
    emailAtualConta,
    enviarFotoPerfilNoBackend,
    enviarRelatoSuporteNoBackend,
    feedbackDraft,
    handleConfirmarSettingsSheetReauth,
    nomeCompletoDraft,
    nomeExibicaoDraft,
    notificarConfiguracaoConcluida,
    novaSenhaDraft,
    novoEmailDraft,
    onRegistrarEventoSegurancaLocal: registrarEventoSegurancaLocal,
    onSetBugAttachmentDraft: setBugAttachmentDraft,
    onSetBugDescriptionDraft: setBugDescriptionDraft,
    onSetBugEmailDraft: setBugEmailDraft,
    onSetCartaoAtual: setCartaoAtual,
    onSetConfirmarSenhaDraft: setConfirmarSenhaDraft,
    onSetEmailAtualConta: setEmailAtualConta,
    onSetFeedbackDraft: setFeedbackDraft,
    onSetFilaSuporteLocal: setFilaSuporteLocal,
    onSetNomeCompletoDraft: setNomeCompletoDraft,
    onSetNomeExibicaoDraft: setNomeExibicaoDraft,
    onSetNovaSenhaDraft: setNovaSenhaDraft,
    onSetPerfilExibicao: setPerfilExibicao,
    onSetPerfilFotoHint: setPerfilFotoHint,
    onSetPerfilFotoUri: setPerfilFotoUri,
    onSetPerfilNome: setPerfilNome,
    onSetPlanoAtual: setPlanoAtual,
    onSetProvedoresConectados: setProvedoresConectados,
    onSetSenhaAtualDraft: setSenhaAtualDraft,
    onSetSession: setSession,
    onSetSettingsSheetLoading: setSettingsSheetLoading,
    onSetSettingsSheetNotice: setSettingsSheetNotice,
    onSetStatusApi: setStatusApi,
    onSetStatusAtualizacaoApp: setStatusAtualizacaoApp,
    onSetTelefoneDraft: setTelefoneDraft,
    onSetUltimaVerificacaoAtualizacao: setUltimaVerificacaoAtualizacao,
    onUpdateAccountPhone: (value) =>
      settingsActions.updateAccount({ phone: value }),
    onAtualizarPerfilContaNoBackend: atualizarPerfilContaNoBackend,
    onAtualizarSenhaContaNoBackend: atualizarSenhaContaNoBackend,
    onPingApi: pingApi,
    perfilExibicao,
    perfilFotoHint,
    perfilFotoUri,
    perfilNome,
    planoAtual,
    senhaAtualDraft,
    session,
    sessaoAtual,
    settingsSheet,
    statusApi,
    telefoneDraft,
    workspaceResumoConfiguracao,
  });
  const {
    handleConfirmarAcaoCritica,
    handleExportarDados,
    handleSelecionarModeloIa,
  } = buildSettingsConfirmAndExportActions({
    abrirFluxoReautenticacao,
    abrirSheetConfiguracao,
    compartilharMelhoriaIa,
    compartilharTextoExportado,
    confirmSheet,
    confirmTextDraft,
    corDestaque,
    densidadeInterface,
    economiaDados,
    email,
    emailAtualConta,
    emailsAtivos,
    estiloResposta,
    eventosSeguranca,
    executarExclusaoContaLocal,
    fecharConfirmacaoConfiguracao,
    fecharSheetConfiguracao,
    integracoesExternas,
    idiomaResposta,
    laudosDisponiveis,
    limparCachePorPrivacidade,
    memoriaIa,
    modeloIa,
    mostrarConteudoNotificacao,
    mostrarSomenteNovaMensagem,
    notificacoes,
    notificaPush,
    notificaRespostas,
    ocultarConteudoBloqueado,
    onCreateNewConversation: criarConversaNova,
    onIsValidAiModel: (value) => ehOpcaoValida(value, AI_MODEL_OPTIONS),
    onRegistrarEventoSegurancaLocal: registrarEventoSegurancaLocal,
    onSetAnexoMesaRascunho: setAnexoMesaRascunho,
    onSetAnexoRascunho: setAnexoRascunho,
    onSetBuscaHistorico: setBuscaHistorico,
    onSetCacheLeitura: setCacheLeitura,
    onSetConversa: setConversa,
    onSetLaudosDisponiveis: setLaudosDisponiveis,
    onSetMensagem: setMensagem,
    onSetMensagemMesa: setMensagemMesa,
    onSetMensagensMesa: setMensagensMesa,
    onSetModeloIa: setModeloIa,
    onSetNotificacoes: setNotificacoes,
    onSetPreviewAnexoImagem: setPreviewAnexoImagem,
    perfilExibicao,
    perfilNome,
    planoAtual,
    reautenticacaoAindaValida,
    reautenticacaoExpiraEm,
    retencaoDados,
    salvarHistoricoConversas,
    serializarPayloadExportacao,
    tamanhoFonte,
    temaApp,
    usoBateria,
    vibracaoAtiva,
  });
  const {
    handleExportarAntesDeExcluirConta,
    handleReportarAtividadeSuspeita,
    handleRevisarPermissoesCriticas,
    handleToggleBackupAutomatico,
    handleToggleEntradaPorVoz,
    handleToggleMostrarConteudoNotificacao,
    handleToggleMostrarSomenteNovaMensagem,
    handleToggleNotificaPush,
    handleToggleOcultarConteudoBloqueado,
    handleToggleRespostaPorVoz,
    handleToggleSincronizacaoDispositivos,
    handleToggleSpeechEnabled,
    handleToggleUploadArquivos,
    handleToggleVibracao,
  } = useSettingsToggleActions<MobileReadCache>({
    arquivosPermitidos,
    cacheLeituraVazio: CACHE_LEITURA_VAZIO,
    cameraPermitida,
    executarComReautenticacao,
    filaOffline,
    microfonePermitido,
    notificacoesPermitidas,
    sessionAccessToken: session?.accessToken || null,
    statusApi,
    abrirConfirmacaoConfiguracao,
    handleExportarDados,
    onIsOfflineItemReadyForRetry: pendenciaFilaProntaParaReenvio,
    onOpenSystemSettings: () => {
      void Linking.openSettings();
    },
    onSaveReadCacheLocally: salvarCacheLeituraLocal,
    onSetSettingsSheetNotice: setSettingsSheetNotice,
    onSyncOfflineQueue: sincronizarFilaOffline,
    registrarEventoSegurancaLocal,
    setAnexoMesaRascunho,
    setAnexoRascunho,
    setArquivosPermitidos,
    setBackupAutomatico,
    setEntradaPorVoz,
    setMicrofonePermitido,
    setMostrarConteudoNotificacao,
    setMostrarSomenteNovaMensagem,
    setNotificaPush,
    setNotificacoesPermitidas,
    setOcultarConteudoBloqueado,
    setRespostaPorVoz,
    setSpeechEnabled,
    setSincronizacaoDispositivos,
    setUploadArquivosAtivo,
    setVibracaoAtiva,
    voiceInputRuntimeSupported: voiceRuntimeState.sttSupported,
    voiceInputUnavailableMessage:
      buildVoiceInputUnavailableMessage(voiceLanguage),
    showAlert: Alert.alert,
  });
  const renderSettingsSheetBody = buildSettingsSheetBodyRenderer({
    apiEnvironmentLabel,
    appBuildLabel: appRuntime.buildLabel,
    appName: session?.bootstrap.app.nome || "Tariel Inspetor",
    artigoAjudaExpandidoId,
    artigosAjudaFiltrados,
    bugAttachmentDraft,
    bugDescriptionDraft,
    bugEmailDraft,
    buscaAjuda,
    cartaoAtual,
    confirmarSenhaDraft,
    email,
    emailAtualConta,
    feedbackDraft,
    formatarHorarioAtividade,
    formatarStatusReautenticacao,
    handleAlternarArtigoAjuda,
    handleAlternarIntegracaoExterna,
    handleRemoverScreenshotBug,
    handleSelecionarModeloIa,
    handleSelecionarScreenshotBug,
    handleSincronizarIntegracaoExterna,
    handleToggleUploadArquivos,
    integracaoSincronizandoId,
    integracoesConectadasTotal,
    integracoesDisponiveisTotal,
    integracoesExternas,
    modeloIa,
    nomeAutomaticoConversas,
    nomeCompletoDraft,
    nomeExibicaoDraft,
    novaSenhaDraft,
    novoEmailDraft,
    onSetBugDescriptionDraft: setBugDescriptionDraft,
    onSetBugEmailDraft: setBugEmailDraft,
    onSetBuscaAjuda: setBuscaAjuda,
    onSetConfirmarSenhaDraft: setConfirmarSenhaDraft,
    onSetFeedbackDraft: setFeedbackDraft,
    onSetNomeAutomaticoConversas: setNomeAutomaticoConversas,
    onSetNomeCompletoDraft: setNomeCompletoDraft,
    onSetNomeExibicaoDraft: setNomeExibicaoDraft,
    onSetNovaSenhaDraft: setNovaSenhaDraft,
    onSetNovoEmailDraft: setNovoEmailDraft,
    onSetSenhaAtualDraft: setSenhaAtualDraft,
    onSetTelefoneDraft: setTelefoneDraft,
    perfilFotoHint,
    perfilFotoUri,
    planoAtual,
    provedoresConectados,
    reauthReason,
    reautenticacaoExpiraEm,
    resumoAtualizacaoApp,
    resumoFilaSuporteLocal,
    resumoSuporteApp,
    retencaoDados,
    salvarHistoricoConversas,
    senhaAtualDraft,
    sessaoAtual,
    settingsSheet,
    statusApi,
    statusAtualizacaoApp,
    supportChannelLabel: canalSuporteLabel,
    telefoneDraft,
    ultimaVerificacaoAtualizacaoLabel,
    ultimoTicketSuporte,
    uploadArquivosAtivo,
    workspaceLabel: workspaceResumoConfiguracao,
  });
  const settingsDrawerPanelProps = buildInspectorSettingsDrawerPanelProps(
    buildInspectorSettingsDrawerInput({
      account: {
        contaEmailLabel,
        contaTelefoneLabel,
        email,
        emailAtualConta,
        handleAlterarEmail,
        handleAlterarSenha,
        handleEditarPerfil,
        handleGerenciarPagamento,
        handleGerenciarPlano,
        handleHistoricoPagamentos,
        handleLogout,
        handleSolicitarLogout,
        handleUploadFotoPerfil,
        iniciaisPerfilConfiguracao,
        nomeUsuarioExibicao,
        perfilExibicao,
        perfilExibicaoLabel,
        perfilFotoHint,
        perfilFotoUri,
        perfilNome,
        perfilNomeCompleto,
        planoAtual,
        planoResumoConfiguracao,
        provedorPrimario,
        resumoContaAcesso,
        resumoMetodosConta,
        workspaceResumoConfiguracao,
      },
      experience: {
        aprendizadoIa,
        animacoesAtivas,
        artigosAjudaFiltrados,
        chatCategoryEnabled,
        corDestaque,
        criticalAlertsEnabled,
        densidadeInterface,
        emailsAtivos,
        entradaPorVoz,
        estiloResposta,
        handleAbrirAjudaDitado,
        handleAbrirModeloIa,
        handleToggleEntradaPorVoz,
        handleToggleNotificaPush,
        handleToggleRespostaPorVoz,
        handleToggleSpeechEnabled,
        handleToggleVibracao,
        idiomaResposta,
        mediaCompression,
        memoriaIa,
        mesaCategoryEnabled,
        microfonePermitido,
        modeloIa,
        nomeAutomaticoConversas,
        notificaPush,
        notificaRespostas,
        notificacoesPermitidas,
        onAbrirPermissaoNotificacoes: handleAbrirPermissaoNotificacoes,
        onCyclePreferredVoice,
        preferredVoiceLabel,
        respostaPorVoz,
        setAnimacoesAtivas,
        setAprendizadoIa,
        setChatCategoryEnabled,
        setCorDestaque,
        setCriticalAlertsEnabled,
        setDensidadeInterface,
        setEmailsAtivos,
        setEstiloResposta,
        setIdiomaResposta,
        setMemoriaIa,
        setMesaCategoryEnabled,
        setNomeAutomaticoConversas,
        setNotificaRespostas,
        setSomNotificacao,
        setSpeechEnabled,
        setSpeechRate,
        setSystemCategoryEnabled,
        setTamanhoFonte,
        setTemperaturaIa,
        setTemaApp,
        setTomConversa,
        setVoiceLanguage,
        somNotificacao,
        speechEnabled,
        speechRate,
        sttSupported: voiceRuntimeState.sttSupported,
        systemCategoryEnabled,
        tamanhoFonte,
        temperaturaIa,
        temaApp,
        ttsSupported: voiceRuntimeState.ttsSupported,
        tomConversa,
        vibracaoAtiva,
        voiceLanguage,
      },
      navigation: {
        appBuildChannel: APP_BUILD_CHANNEL,
        appVersionLabel: `${appRuntime.versionLabel} • ${appRuntime.buildLabel}`,
        configuracoesDrawerX,
        fecharConfiguracoes,
        handleAbrirPaginaConfiguracoes,
        handleAbrirSecaoConfiguracoes,
        handleVoltarResumoConfiguracoes,
        mostrarGrupoContaAcesso,
        mostrarGrupoExperiencia,
        mostrarGrupoSeguranca,
        mostrarGrupoSistema,
        onAbrirFilaOffline: () => {
          setFilaOfflineAberta(true);
        },
        settingsDrawerInOverview,
        settingsDrawerMatchesPage,
        settingsDrawerMatchesSection,
        settingsDrawerPage,
        settingsDrawerPageSections,
        settingsDrawerPanResponder,
        settingsDrawerSectionMenuAtiva,
        settingsDrawerSubtitle,
        settingsDrawerTitle,
        settingsPrintDarkMode,
        temaResumoConfiguracao,
        temPrioridadesConfiguracao,
        totalSecoesConfiguracaoVisiveis,
      },
      security: {
        analyticsOptIn,
        arquivosPermitidos,
        autoUploadAttachments,
        backupAutomatico,
        biometriaPermitida,
        cameraPermitida,
        codigo2FA,
        codigosRecuperacao,
        compartilharMelhoriaIa,
        conversasOcultasTotal,
        conversasVisiveisTotal,
        crashReportsOptIn,
        deviceBiometricsEnabled,
        eventosSegurancaFiltrados,
        filtroEventosSeguranca,
        fixarConversas,
        handleApagarHistoricoConfiguracoes,
        handleCompartilharCodigosRecuperacao,
        handleConfirmarCodigo2FA,
        handleConectarProximoProvedorDisponivel,
        handleDetalhesSegurancaArquivos,
        handleEncerrarOutrasSessoes,
        handleEncerrarSessao,
        handleEncerrarSessaoAtual,
        handleEncerrarSessoesSuspeitas,
        handleExcluirConta,
        handleExportarAntesDeExcluirConta,
        handleExportarDados,
        handleGerarCodigosRecuperacao,
        handleGerenciarConversasIndividuais,
        handleGerenciarPermissao,
        handleMudarMetodo2FA,
        handleReautenticacaoSensivel,
        handleReportarAtividadeSuspeita,
        handleRevisarPermissoesCriticas,
        handleRevisarSessao,
        handleToggle2FA,
        handleToggleBackupAutomatico,
        handleToggleBiometriaNoDispositivo,
        handleToggleMostrarConteudoNotificacao,
        handleToggleMostrarSomenteNovaMensagem,
        handleToggleOcultarConteudoBloqueado,
        handleToggleProviderConnection,
        handleToggleSincronizacaoDispositivos,
        hideInMultitask,
        lockTimeout,
        mostrarConteudoNotificacao,
        mostrarSomenteNovaMensagem,
        outrasSessoesAtivas,
        ocultarConteudoBloqueado,
        permissoesNegadasTotal,
        previewPrivacidadeNotificacao,
        provedoresConectados,
        provedoresConectadosTotal,
        reautenticacaoStatus,
        recoveryCodesEnabled,
        requireAuthOnOpen,
        resumo2FAFootnote,
        resumo2FAStatus,
        resumoAlertaMetodosConta,
        resumoBlindagemSessoes,
        resumoCache,
        resumoCodigosRecuperacao,
        resumoDadosConversas,
        resumoExcluirConta,
        resumoPermissoes,
        resumoPermissoesCriticas,
        resumoPrivacidadeNotificacoes,
        resumoSessaoAtual,
        retencaoDados,
        salvarHistoricoConversas,
        setAnalyticsOptIn,
        setAutoUploadAttachments,
        setCodigo2FA,
        setCompartilharMelhoriaIa,
        setCrashReportsOptIn,
        setFiltroEventosSeguranca,
        setFixarConversas,
        setHideInMultitask,
        setLockTimeout,
        setMediaCompression,
        setRecoveryCodesEnabled,
        setRequireAuthOnOpen,
        setRetencaoDados,
        setSalvarHistoricoConversas,
        setWifiOnlySync,
        sessoesAtivas,
        sessoesSuspeitasTotal,
        sincronizacaoDispositivos,
        twoFactorEnabled,
        twoFactorMethod,
        ultimoEventoProvedor,
        ultimoEventoSessao,
        wifiOnlySync,
      },
      supportAndSystem: {
        contaEmailLabel,
        contaTelefoneLabel,
        corDestaqueResumoConfiguracao,
        economiaDados,
        existeProvedorDisponivel,
        filaSuporteLocal,
        handleAbrirAjustesDoSistema,
        handleAbrirCanalSuporte,
        handleAbrirCentralAtividade,
        handleAbrirSobreApp,
        handleCentralAjuda,
        handleEnviarFeedback,
        handleExportarDiagnosticoApp,
        handleLicencas,
        handleLimparCache,
        handleLimparFilaSuporteLocal,
        handlePermissoes,
        handlePluginsIa,
        handlePoliticaPrivacidade,
        handleRefresh,
        handleReportarProblema,
        handleTermosUso,
        handleVerificarAtualizacoes,
        idiomaApp,
        integracoesConectadasTotal,
        integracoesDisponiveisTotal,
        limpandoCache,
        onSetEconomiaDados: setEconomiaDados,
        regiaoApp,
        resumoCentralAtividade,
        resumoFilaOffline,
        resumoFilaSuporteLocal,
        resumoSuporteApp,
        setRegiaoApp,
        setUsoBateria,
        sincronizandoDados,
        supportChannelLabel: canalSuporteLabel,
        ticketsBugTotal,
        ticketsFeedbackTotal,
        ultimaVerificacaoAtualizacaoLabel,
        ultimoTicketSuporteResumo,
        uploadArquivosAtivo,
        usoBateria,
        verificandoAtualizacoes,
      },
    }),
  );
  const notificacoesMesaLaudoAtual = notificacoes.filter(
    (item) =>
      item.unread &&
      item.targetThread === "mesa" &&
      item.laudoId === laudoSelecionadoId,
  ).length;
  const sessionModalsStackProps = buildInspectorSessionModalsStackProps(
    buildInspectorSessionModalsInput({
      activityAndLock: {
        bloqueioAppAtivo,
        centralAtividadeAberta,
        deviceBiometricsEnabled,
        formatarHorarioAtividade,
        handleAbrirNotificacao,
        handleDesbloquearAplicativo,
        handleLogout,
        monitorandoAtividade,
        notificacoes,
        session,
        setCentralAtividadeAberta,
      },
      attachment: {
        anexosAberto,
        handleEscolherAnexo,
        previewAnexoImagem,
        setAnexosAberto,
        setPreviewAnexoImagem,
      },
      offlineQueue: {
        detalheStatusPendenciaOffline,
        filaOfflineAberta,
        filaOfflineFiltrada,
        filaOfflineOrdenada,
        filtroFilaOffline,
        filtrosFilaOffline,
        handleRetomarItemFilaOffline,
        iconePendenciaOffline,
        legendaPendenciaOffline,
        pendenciaFilaProntaParaReenvio,
        podeSincronizarFilaOffline,
        removerItemFilaOffline,
        resumoFilaOfflineFiltrada,
        resumoPendenciaOffline,
        rotuloStatusPendenciaOffline,
        setFilaOfflineAberta,
        setFiltroFilaOffline,
        sincronizacaoDispositivos,
        sincronizarFilaOffline,
        sincronizarItemFilaOffline,
        sincronizandoFilaOffline,
        sincronizandoItemFilaId,
        statusApi,
      },
      settings: {
        confirmSheet,
        confirmTextDraft,
        fecharConfirmacaoConfiguracao,
        fecharSheetConfiguracao,
        handleConfirmarAcaoCritica,
        handleConfirmarSettingsSheet,
        renderSettingsSheetBody,
        setConfirmTextDraft,
        settingsSheet,
        settingsSheetLoading,
        settingsSheetNotice,
      },
    }),
  );
  const {
    chipsContextoThread,
    laudoContextDescription,
    laudoContextTitle,
    mostrarContextoThread,
    threadInsights,
    threadSpotlight,
  } = buildThreadContextState({
    conversaAtiva,
    filtrarThreadContextChips,
    mapearStatusLaudoVisual,
    mesaDisponivel,
    mesaTemMensagens,
    mensagensMesa,
    notificacoesMesaLaudoAtual,
    resumoFilaOffline,
    statusApi,
    tipoTemplateAtivoLabel,
    vendoMesa,
  });

  if (session) {
    const authenticatedLayoutProps = buildAuthenticatedLayoutProps(
      buildAuthenticatedLayoutInput({
        shell: {
          accentColor,
          animacoesAtivas,
          appGradientColors,
          chatKeyboardVerticalOffset,
          composerNotice: chatAiBehaviorNotice,
          configuracoesAberta,
          drawerOverlayOpacity,
          erroConversa,
          erroLaudos,
          fecharPaineisLaterais,
          introVisivel,
          keyboardAvoidingBehavior,
          keyboardVisible,
          onVoiceInputPress: handleVoiceInputPress,
          sessionModalsStackProps,
          setIntroVisivel,
          settingsDrawerPanelProps,
          settingsEdgePanResponder,
          vendoMesa,
        },
        history: {
          buscaHistorico,
          conversasOcultasTotal,
          fecharHistorico,
          handleAbrirHistorico,
          handleExcluirConversaHistorico,
          handleSelecionarHistorico,
          historicoAberto,
          historicoAgrupadoFinal,
          historicoDrawerX,
          historicoVazioTexto,
          historicoVazioTitulo,
          historyDrawerPanResponder,
          historyEdgePanResponder,
          laudoSelecionadoId,
          setBuscaHistorico,
        },
        thread: {
          abrirReferenciaNoChat,
          chipsContextoThread,
          conversaAtiva,
          conversaVazia,
          definirReferenciaMesaAtiva,
          dynamicMessageBubbleStyle,
          dynamicMessageTextStyle,
          filaOfflineOrdenada,
          handleAbrirAnexo,
          handleAbrirConfiguracoes,
          handleAbrirNovoChat,
          headerSafeTopInset,
          laudoContextDescription,
          laudoContextTitle,
          mesaDisponivel,
          mesaTemMensagens,
          mensagemChatDestacadaId,
          mensagensMesa,
          mensagensVisiveis,
          mostrarContextoThread,
          nomeUsuarioExibicao,
          notificacoesMesaLaudoAtual,
          notificacoesNaoLidas,
          obterResumoReferenciaMensagem,
          registrarLayoutMensagemChat,
          threadInsights,
          threadKeyboardPaddingBottom,
          threadSpotlight,
          chaveAnexo,
        },
        composer: {
          anexoAbrindoChave,
          anexoMesaRascunho,
          anexoRascunho,
          carregandoConversa,
          carregandoMesa,
          dynamicComposerInputStyle,
          enviandoMensagem,
          enviandoMesa,
          erroMesa,
          handleAbrirSeletorAnexo,
          handleEnviarMensagem,
          handleEnviarMensagemMesa,
          handleReabrir,
          limparReferenciaMesaAtiva,
          mensagem,
          mensagemMesa,
          mensagemMesaReferenciaAtiva,
          placeholderComposer,
          placeholderMesa,
          podeAbrirAnexosChat,
          podeAbrirAnexosMesa,
          podeAcionarComposer,
          podeEnviarComposer,
          podeEnviarMesa,
          podeUsarComposerMesa,
          setAnexoMesaRascunho,
          setAnexoRascunho,
          setMensagem,
          setMensagemMesa,
          showVoiceInputAction: speechEnabled && entradaPorVoz,
          voiceInputEnabled:
            speechEnabled && entradaPorVoz && microfonePermitido,
        },
        session: {
          scrollRef,
          sessionAccessToken: session.accessToken,
          setAbaAtiva,
        },
      }),
    );

    return <InspectorAuthenticatedLayout {...authenticatedLayoutProps} />;
  }

  const loginScreenProps = buildLoginScreenProps({
    accentColor,
    animacoesAtivas,
    appGradientColors,
    carregando,
    email,
    emailInputRef,
    entrando,
    erro,
    fontScale,
    handleEsqueciSenha,
    handleLogin,
    handleLoginSocial,
    introVisivel,
    keyboardAvoidingBehavior,
    keyboardVisible,
    loginKeyboardBottomPadding,
    loginKeyboardVerticalOffset,
    mostrarSenha,
    senha,
    senhaInputRef,
    setEmail,
    setIntroVisivel,
    setMostrarSenha,
    setSenha,
  });

  return <LoginScreen {...loginScreenProps} />;
}
