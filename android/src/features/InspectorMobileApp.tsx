import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  type AppStateStatus,
  Easing,
  Keyboard,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  Vibration,
  View,
} from "react-native";

import {
  carregarBootstrapMobile,
  carregarLaudosMobile,
  carregarMensagensLaudo,
  carregarMensagensMesaMobile,
  carregarStatusLaudo,
  enviarAnexoMesaMobile,
  enviarMensagemMesaMobile,
  enviarMensagemChatMobile,
  loginInspectorMobile,
  logoutInspectorMobile,
  obterUrlLoginSocialMobile,
  obterUrlRecuperacaoSenhaMobile,
  pingApi,
  reabrirLaudoMobile,
  uploadDocumentoChatMobile,
} from "../config/api";
import {
  listarEventosObservabilidade,
  registrarEventoObservabilidade,
  resumirEventosObservabilidade,
} from "../config/observability";
import type {
  ApiHealthStatus,
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
  APP_PREFERENCES_FILE,
  APP_VERSION_LABEL,
  BATTERY_OPTIONS,
  CONVERSATION_TONE_OPTIONS,
  DATA_RETENTION_OPTIONS,
  DENSITY_OPTIONS,
  EMAIL_KEY,
  EXTERNAL_INTEGRATION_OPTIONS,
  FONT_SIZE_OPTIONS,
  HELP_CENTER_ARTICLES,
  HISTORY_DRAWER_FILTERS,
  HISTORY_PANEL_CLOSED_X,
  LICENSES_CATALOG,
  LOCK_TIMEOUT_OPTIONS,
  MAX_NOTIFICATIONS,
  NOTIFICATIONS_FILE,
  NOTIFICATION_SOUND_OPTIONS,
  OFFLINE_QUEUE_FILE,
  PANEL_ANIMATION_DURATION,
  PANEL_CLOSE_SWIPE_THRESHOLD,
  PANEL_EDGE_GESTURE_WIDTH,
  PANEL_OPEN_SWIPE_THRESHOLD,
  PAYMENT_CARD_OPTIONS,
  PLAN_OPTIONS,
  READ_CACHE_FILE,
  REGION_OPTIONS,
  RESPONSE_LANGUAGE_OPTIONS,
  RESPONSE_STYLE_OPTIONS,
  SCREEN_WIDTH,
  SECURITY_EVENT_FILTERS,
  SETTINGS_DRAWER_FILTERS,
  SETTINGS_PANEL_CLOSED_X,
  TARIEL_APP_MARK,
  TEMPERATURE_STEPS,
  TERMS_OF_USE_SECTIONS,
  THEME_OPTIONS,
  TOKEN_KEY,
  TWO_FACTOR_METHOD_OPTIONS,
  UPDATE_CHANGELOG,
} from "./InspectorMobileApp.constants";
import { styles } from "./InspectorMobileApp.styles";
import { runMonitorActivityFlow } from "./activity/monitorActivityFlow";
import { buildLoginScreenProps } from "./auth/buildLoginScreenProps";
import { LoginScreen } from "./auth/LoginScreen";
import {
  capturarImagemRascunhoFlow,
  selecionarDocumentoRascunhoFlow,
  selecionarImagemRascunhoFlow,
} from "./chat/attachmentDraftFlows";
import { buildThreadContextState } from "./chat/buildThreadContextState";
import { ehImagemAnexo, nomeExibicaoAnexo, urlAnexoAbsoluta } from "./chat/attachmentUtils";
import { sendInspectorMessageFlow, sendMesaMessageFlow } from "./chat/messageSendFlows";
import { runBootstrapAppFlow } from "./bootstrap/runBootstrapAppFlow";
import { buildAuthenticatedLayoutProps } from "./common/buildAuthenticatedLayoutProps";
import { buildInspectorBaseDerivedState } from "./common/buildInspectorBaseDerivedState";
import { buildInspectorSessionModalsStackProps } from "./common/buildInspectorSessionModalsStackProps";
import {
  atualizarPerfilContaNoBackend,
  atualizarSenhaContaNoBackend,
  enviarFotoPerfilNoBackend,
  enviarRelatoSuporteNoBackend,
  mapearUsuarioParaPerfilConta,
} from "./settings/settingsBackend";
import type { PerfilContaSincronizado } from "./settings/settingsBackend";
import type { CriticalSettingsSnapshot } from "./settings/criticalSettings";
import { renderSettingsSheetBodyContent } from "./settings/SettingsSheetBodyContent";
import { applyLocalPreferencesFromStorage } from "./settings/applyLocalPreferences";
import { buildInspectorSettingsDrawerPanelProps } from "./settings/buildInspectorSettingsDrawerPanelProps";
import { runExportDataFlow } from "./settings/exportDataFlow";
import { handleConfirmSheetAction } from "./settings/settingsConfirmActions";
import { handleSettingsSheetConfirmDelegated } from "./settings/settingsSheetConfirmActions";
import type { ConfirmSheetState, SettingsSheetState } from "./settings/settingsSheetTypes";
import {
  type SettingsDrawerPage,
  type SettingsSectionKey,
} from "./settings/settingsNavigationMeta";
import { useCriticalSettingsSync } from "./settings/useCriticalSettingsSync";
import { InspectorAuthenticatedLayout } from "./InspectorAuthenticatedLayout";

function pushSettingsNavigationState(
  historyRef: { current: SettingsNavigationState[] },
  state: SettingsNavigationState,
): void {
  const history = historyRef.current;
  const last = history[history.length - 1];
  if (last && last.page === state.page && last.section === state.section) {
    return;
  }
  history.push(state);
}

interface MobileSessionState {
  accessToken: string;
  bootstrap: MobileBootstrapResponse;
}

interface ChatState {
  laudoId: number | null;
  estado: MobileEstadoLaudo | string;
  statusCard: string;
  permiteEdicao: boolean;
  permiteReabrir: boolean;
  laudoCard: MobileLaudoCard | null;
  modo: MobileChatMode | string;
  mensagens: MobileChatMessage[];
}

type ActiveThread = "chat" | "mesa";
type OfflineQueueFilter = "all" | "chat" | "mesa";
type HistoryDrawerFilter = (typeof HISTORY_DRAWER_FILTERS)[number]["key"];
type ThreadContextChipTone = "accent" | "success" | "danger" | "muted";

interface ThreadContextChipItem {
  key: string;
  label: string;
  tone: ThreadContextChipTone;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

type ComposerAttachment =
  | {
      kind: "image";
      label: string;
      resumo: string;
      dadosImagem: string;
      previewUri: string;
      fileUri: string;
      mimeType: string;
    }
  | {
      kind: "document";
      label: string;
      resumo: string;
      textoDocumento: string;
      nomeDocumento: string;
      chars: number;
      truncado: boolean;
      fileUri: string;
      mimeType: string;
    };

interface AttachmentPreviewState {
  titulo: string;
  uri: string;
}

interface MessageReferenceState {
  id: number;
  texto: string;
}

interface OfflinePendingMessage {
  id: string;
  channel: "chat" | "mesa";
  laudoId: number | null;
  text: string;
  createdAt: string;
  title: string;
  attachment: ComposerAttachment | null;
  referenceMessageId: number | null;
  attempts: number;
  lastAttemptAt: string;
  lastError: string;
  nextRetryAt: string;
}

interface MobileActivityNotification {
  id: string;
  kind: "status" | "mesa_nova" | "mesa_resolvida" | "mesa_reaberta";
  laudoId: number | null;
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
  targetThread: ActiveThread;
}

interface MobileReadCache {
  bootstrap: MobileBootstrapResponse | null;
  laudos: MobileLaudoCard[];
  conversaAtual: ChatState | null;
  conversasPorLaudo: Record<string, ChatState>;
  mesaPorLaudo: Record<string, MobileMesaMessage[]>;
  chatDrafts: Record<string, string>;
  mesaDrafts: Record<string, string>;
  chatAttachmentDrafts: Record<string, ComposerAttachment>;
  mesaAttachmentDrafts: Record<string, ComposerAttachment>;
  updatedAt: string;
}

type ConnectedProviderId = "google" | "apple" | "microsoft";
type ExternalIntegrationId = (typeof EXTERNAL_INTEGRATION_OPTIONS)[number]["id"];
type SecurityEventFilter = (typeof SECURITY_EVENT_FILTERS)[number];
type SettingsDrawerFilter = (typeof SETTINGS_DRAWER_FILTERS)[number]["key"];

interface ConnectedProvider {
  id: ConnectedProviderId;
  label: string;
  email: string;
  connected: boolean;
  requiresReauth: boolean;
}

interface ExternalIntegration {
  id: ExternalIntegrationId;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  connected: boolean;
  lastSyncAt: string;
}

interface SessionDevice {
  id: string;
  title: string;
  meta: string;
  location: string;
  lastSeen: string;
  current: boolean;
  suspicious?: boolean;
}

interface SecurityEventItem {
  id: string;
  title: string;
  meta: string;
  status: string;
  type: "login" | "provider" | "2fa" | "data" | "session";
  critical?: boolean;
}

interface SupportQueueItem {
  id: string;
  kind: "bug" | "feedback";
  title: string;
  body: string;
  email: string;
  createdAt: string;
  status: string;
  attachmentLabel?: string;
  attachmentUri?: string;
  attachmentKind?: "image" | "document";
}

interface AppPreferencesState {
  perfilNome: string;
  perfilExibicao: string;
  perfilFotoUri: string;
  perfilFotoHint: string;
  laudosFixadosIds: number[];
  historicoOcultoIds: number[];
  planoAtual: (typeof PLAN_OPTIONS)[number];
  cartaoAtual: (typeof PAYMENT_CARD_OPTIONS)[number];
  modeloIa: (typeof AI_MODEL_OPTIONS)[number];
  estiloResposta: (typeof RESPONSE_STYLE_OPTIONS)[number];
  idiomaResposta: (typeof RESPONSE_LANGUAGE_OPTIONS)[number];
  memoriaIa: boolean;
  aprendizadoIa: boolean;
  tomConversa: (typeof CONVERSATION_TONE_OPTIONS)[number];
  temperaturaIa: number;
  temaApp: (typeof THEME_OPTIONS)[number];
  tamanhoFonte: (typeof FONT_SIZE_OPTIONS)[number];
  densidadeInterface: (typeof DENSITY_OPTIONS)[number];
  corDestaque: (typeof ACCENT_OPTIONS)[number];
  animacoesAtivas: boolean;
  notificaRespostas: boolean;
  notificaPush: boolean;
  somNotificacao: (typeof NOTIFICATION_SOUND_OPTIONS)[number];
  vibracaoAtiva: boolean;
  emailsAtivos: boolean;
  salvarHistoricoConversas: boolean;
  compartilharMelhoriaIa: boolean;
  backupAutomatico: boolean;
  sincronizacaoDispositivos: boolean;
  nomeAutomaticoConversas: boolean;
  fixarConversas: boolean;
  entradaPorVoz: boolean;
  respostaPorVoz: boolean;
  uploadArquivosAtivo: boolean;
  economiaDados: boolean;
  usoBateria: (typeof BATTERY_OPTIONS)[number];
  idiomaApp: (typeof APP_LANGUAGE_OPTIONS)[number];
  regiaoApp: (typeof REGION_OPTIONS)[number];
  provedoresConectados: ConnectedProvider[];
  integracoesExternas: ExternalIntegration[];
  sessoesAtivas: SessionDevice[];
  twoFactorEnabled: boolean;
  twoFactorMethod: (typeof TWO_FACTOR_METHOD_OPTIONS)[number];
  recoveryCodesEnabled: boolean;
  deviceBiometricsEnabled: boolean;
  requireAuthOnOpen: boolean;
  hideInMultitask: boolean;
  lockTimeout: (typeof LOCK_TIMEOUT_OPTIONS)[number];
  retencaoDados: (typeof DATA_RETENTION_OPTIONS)[number];
  codigosRecuperacao: string[];
  reautenticacaoStatus: string;
  reautenticacaoExpiraEm: string;
  eventosSeguranca: SecurityEventItem[];
  mostrarConteudoNotificacao: boolean;
  ocultarConteudoBloqueado: boolean;
  mostrarSomenteNovaMensagem: boolean;
  microfonePermitido: boolean;
  cameraPermitida: boolean;
  arquivosPermitidos: boolean;
  notificacoesPermitidas: boolean;
  biometriaPermitida: boolean;
  filaSuporteLocal: SupportQueueItem[];
  ultimaVerificacaoAtualizacao: string;
  statusAtualizacaoApp: string;
}

interface SettingsNavigationState {
  page: SettingsDrawerPage;
  section: SettingsSectionKey | "all";
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

function nextOptionValue<T extends string>(current: T, options: readonly T[]): T {
  const currentIndex = options.indexOf(current);
  if (currentIndex === -1) {
    return options[0];
  }
  return options[(currentIndex + 1) % options.length];
}

function filtrarThreadContextChips(items: Array<ThreadContextChipItem | null>): ThreadContextChipItem[] {
  return items.filter((item): item is ThreadContextChipItem => item !== null);
}

function startOfDay(date: Date): number {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone.getTime();
}

function getHistorySectionKey(dataIso: string, referencia = new Date()): (typeof historySectionOrder)[number] {
  const alvo = new Date(dataIso);
  if (Number.isNaN(alvo.getTime())) {
    return "older";
  }

  const diffDays = Math.floor((startOfDay(referencia) - startOfDay(alvo)) / 86_400_000);

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

function getHistorySectionLabel(key: (typeof historySectionOrder)[number]): string {
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
  const buckets = new Map<(typeof historySectionOrder)[number], MobileLaudoCard[]>();
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
    ? [{ key: "pinned", title: "Fixadas", items: fixados }, ...secoesCronologicas]
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

function atualizarResumoLaudoAtual<T extends {
  estado: MobileEstadoLaudo | string;
  permite_edicao: boolean;
  permite_reabrir: boolean;
  laudo_card: MobileLaudoCard | null;
  modo?: MobileChatMode | string;
}>(
  estadoAtual: ChatState | null,
  payload: T,
): ChatState | null {
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
    modo: normalizarModoChat(payload.modo, normalizarModoChat(estadoAtual.modo)),
  };
}

async function obterItemSeguro(chave: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(chave);
  } catch (error) {
    console.warn(`Falha ao ler SecureStore (${chave})`, error);
    return null;
  }
}

async function salvarItemSeguro(chave: string, valor: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(chave, valor);
  } catch (error) {
    console.warn(`Falha ao salvar SecureStore (${chave})`, error);
  }
}

async function removerItemSeguro(chave: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(chave);
  } catch (error) {
    console.warn(`Falha ao remover SecureStore (${chave})`, error);
  }
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
        const channel: OfflinePendingMessage["channel"] = registro.channel === "mesa" ? "mesa" : "chat";
        return {
          id: String(registro.id || ""),
          channel,
          laudoId: typeof registro.laudoId === "number" ? registro.laudoId : null,
          text: String(registro.text || "").trim(),
          createdAt: String(registro.createdAt || ""),
          title: String(registro.title || "").trim() || "Mensagem pendente",
          attachment: normalizarComposerAttachment(registro.attachment),
          referenceMessageId: typeof registro.referenceMessageId === "number" ? registro.referenceMessageId : null,
          attempts: typeof registro.attempts === "number" ? Math.max(0, registro.attempts) : 0,
          lastAttemptAt: String(registro.lastAttemptAt || ""),
          lastError: String(registro.lastError || "").trim(),
          nextRetryAt: String(registro.nextRetryAt || ""),
        };
      })
      .filter((item) => item.id && (item.text || item.attachment));
  } catch {
    return [];
  }
}

async function salvarFilaOfflineLocal(fila: OfflinePendingMessage[]): Promise<void> {
  try {
    if (!fila.length) {
      await FileSystem.deleteAsync(OFFLINE_QUEUE_FILE, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(OFFLINE_QUEUE_FILE, JSON.stringify(fila));
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
          laudoId: typeof registro.laudoId === "number" ? registro.laudoId : null,
          title: String(registro.title || "").trim() || "Atividade do inspetor",
          body: String(registro.body || "").trim(),
          createdAt: String(registro.createdAt || "") || new Date().toISOString(),
          unread: Boolean(registro.unread),
          targetThread: registro.targetThread === "mesa" ? "mesa" : "chat",
        } as MobileActivityNotification;
      })
      .filter((item) => item.id && item.title);
  } catch {
    return [];
  }
}

async function salvarNotificacoesLocais(notificacoes: MobileActivityNotification[]): Promise<void> {
  try {
    if (!notificacoes.length) {
      await FileSystem.deleteAsync(NOTIFICATIONS_FILE, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(NOTIFICATIONS_FILE, JSON.stringify(notificacoes));
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

function normalizarComposerAttachment(payload: unknown): ComposerAttachment | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const registro = payload as Record<string, unknown>;
  if (registro.kind === "image") {
    const dadosImagem = typeof registro.dadosImagem === "string" ? registro.dadosImagem : "";
    const previewUri = typeof registro.previewUri === "string" ? registro.previewUri : "";
    const fileUri = typeof registro.fileUri === "string" ? registro.fileUri : "";
    const mimeType = typeof registro.mimeType === "string" ? registro.mimeType : "image/jpeg";
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
    const textoDocumento = typeof registro.textoDocumento === "string" ? registro.textoDocumento : "";
    const nomeDocumento = typeof registro.nomeDocumento === "string" ? registro.nomeDocumento : "";
    const fileUri = typeof registro.fileUri === "string" ? registro.fileUri : "";
    const mimeType = typeof registro.mimeType === "string" ? registro.mimeType : "application/octet-stream";
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

function duplicarComposerAttachment(anexo: ComposerAttachment | null): ComposerAttachment | null {
  if (!anexo) {
    return null;
  }
  return anexo.kind === "image" ? { ...anexo } : { ...anexo };
}

function resumoPendenciaOffline(item: Pick<OfflinePendingMessage, "text" | "attachment">): string {
  if (item.text.trim()) {
    return item.text.trim();
  }
  return textoFallbackAnexo(item.attachment);
}

function iconePendenciaOffline(item: OfflinePendingMessage): keyof typeof MaterialCommunityIcons.glyphMap {
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

function pendenciaFilaProntaParaReenvio(item: OfflinePendingMessage, referencia = Date.now()): boolean {
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
    const tentativas = item.attempts <= 1 ? "1 tentativa" : `${item.attempts} tentativas`;
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
  };
}

function normalizarCacheLeitura(payload: unknown): MobileReadCache {
  if (!payload || typeof payload !== "object") {
    return CACHE_LEITURA_VAZIO;
  }

  const registro = payload as Record<string, unknown>;
  const laudos = Array.isArray(registro.laudos) ? (registro.laudos as MobileLaudoCard[]) : [];
  const conversaAtual =
    registro.conversaAtual && typeof registro.conversaAtual === "object"
      ? (registro.conversaAtual as ChatState)
      : null;

  const conversasPorLaudo =
    registro.conversasPorLaudo && typeof registro.conversasPorLaudo === "object"
      ? Object.fromEntries(
          Object.entries(registro.conversasPorLaudo as Record<string, unknown>).map(([chave, valor]) => [
            chave,
            valor && typeof valor === "object" ? (valor as ChatState) : criarConversaNova(),
          ]),
        )
      : {};

  const mesaPorLaudo =
    registro.mesaPorLaudo && typeof registro.mesaPorLaudo === "object"
      ? Object.fromEntries(
          Object.entries(registro.mesaPorLaudo as Record<string, unknown>).map(([chave, valor]) => [
            chave,
            Array.isArray(valor) ? (valor as MobileMesaMessage[]) : [],
          ]),
        )
      : {};

  const chatDrafts =
    registro.chatDrafts && typeof registro.chatDrafts === "object"
      ? Object.fromEntries(
          Object.entries(registro.chatDrafts as Record<string, unknown>).map(([chave, valor]) => [
            chave,
            typeof valor === "string" ? valor : "",
          ]),
        )
      : {};

  const mesaDrafts =
    registro.mesaDrafts && typeof registro.mesaDrafts === "object"
      ? Object.fromEntries(
          Object.entries(registro.mesaDrafts as Record<string, unknown>).map(([chave, valor]) => [
            chave,
            typeof valor === "string" ? valor : "",
          ]),
        )
      : {};

  const chatAttachmentDrafts =
    registro.chatAttachmentDrafts && typeof registro.chatAttachmentDrafts === "object"
      ? Object.fromEntries(
          Object.entries(registro.chatAttachmentDrafts as Record<string, unknown>)
            .map(([chave, valor]) => [chave, normalizarComposerAttachment(valor)])
            .filter(([, valor]) => Boolean(valor)),
        )
      : {};

  const mesaAttachmentDrafts =
    registro.mesaAttachmentDrafts && typeof registro.mesaAttachmentDrafts === "object"
      ? Object.fromEntries(
          Object.entries(registro.mesaAttachmentDrafts as Record<string, unknown>)
            .map(([chave, valor]) => [chave, normalizarComposerAttachment(valor)])
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
    chatAttachmentDrafts: chatAttachmentDrafts as Record<string, ComposerAttachment>,
    mesaAttachmentDrafts: mesaAttachmentDrafts as Record<string, ComposerAttachment>,
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

function ehOpcaoValida<T extends readonly string[]>(valor: unknown, opcoes: T): valor is T[number] {
  return typeof valor === "string" && (opcoes as readonly string[]).includes(valor);
}

function criarProvedoresConectadosPadrao(emailConta = ""): ConnectedProvider[] {
  return [
    { id: "google", label: "Google", email: "", connected: false, requiresReauth: true },
    { id: "apple", label: "Apple", email: "", connected: false, requiresReauth: true },
    { id: "microsoft", label: "Microsoft", email: emailConta, connected: true, requiresReauth: true },
  ];
}

function criarSessoesAtivasPadrao(): SessionDevice[] {
  return [
    {
      id: "current-device",
      title: "Pixel 7a • Android 14",
      meta: "Tariel Inspetor • App móvel",
      location: "Este dispositivo",
      lastSeen: "Agora",
      current: true,
    },
    {
      id: "chrome-office",
      title: "Chrome • Windows 11",
      meta: "Portal do inspetor",
      location: "São Paulo, BR",
      lastSeen: "Hoje às 09:41",
      current: false,
    },
    {
      id: "tablet-review",
      title: "Galaxy Tab • Android",
      meta: "Teste interno",
      location: "Campinas, BR",
      lastSeen: "Ontem às 18:12",
      current: false,
      suspicious: true,
    },
  ];
}

function normalizarProviderConectado(payload: unknown): ConnectedProvider | null {
  if (!ehRegistro(payload)) {
    return null;
  }
  if (payload.id !== "google" && payload.id !== "apple" && payload.id !== "microsoft") {
    return null;
  }
  return {
    id: payload.id,
    label: typeof payload.label === "string" && payload.label.trim() ? payload.label : payload.id,
    email: typeof payload.email === "string" ? payload.email : "",
    connected: Boolean(payload.connected),
    requiresReauth: payload.requiresReauth !== false,
  };
}

function criarIntegracoesExternasPadrao(): ExternalIntegration[] {
  return EXTERNAL_INTEGRATION_OPTIONS.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    icon: item.icon as keyof typeof MaterialCommunityIcons.glyphMap,
    connected: false,
    lastSyncAt: "",
  }));
}

function normalizarIntegracaoExterna(payload: unknown): ExternalIntegration | null {
  if (!ehRegistro(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  const meta = EXTERNAL_INTEGRATION_OPTIONS.find((item) => item.id === id);
  if (!meta) {
    return null;
  }
  return {
    id: meta.id,
    label: meta.label,
    description: meta.description,
    icon: meta.icon as keyof typeof MaterialCommunityIcons.glyphMap,
    connected: Boolean(payload.connected),
    lastSyncAt: typeof payload.lastSyncAt === "string" ? payload.lastSyncAt : "",
  };
}

function reconciliarIntegracoesExternas(integracoes: ExternalIntegration[]): ExternalIntegration[] {
  const mapaEstado = new Map(
    integracoes.map((item) => [
      item.id,
      {
        connected: item.connected,
        lastSyncAt: item.lastSyncAt,
      },
    ]),
  );

  return criarIntegracoesExternasPadrao().map((item) => {
    const estadoAtual = mapaEstado.get(item.id);
    if (!estadoAtual) {
      return item;
    }
    return {
      ...item,
      connected: estadoAtual.connected,
      lastSyncAt: estadoAtual.lastSyncAt,
    };
  });
}

function normalizarSessaoAtiva(payload: unknown): SessionDevice | null {
  if (!ehRegistro(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  const title = typeof payload.title === "string" ? payload.title : "";
  if (!id || !title) {
    return null;
  }
  return {
    id,
    title,
    meta: typeof payload.meta === "string" ? payload.meta : "",
    location: typeof payload.location === "string" ? payload.location : "",
    lastSeen: typeof payload.lastSeen === "string" ? payload.lastSeen : "",
    current: Boolean(payload.current),
    suspicious: Boolean(payload.suspicious),
  };
}

function normalizarEventoSeguranca(payload: unknown): SecurityEventItem | null {
  if (!ehRegistro(payload)) {
    return null;
  }
  if (
    payload.type !== "login" &&
    payload.type !== "provider" &&
    payload.type !== "2fa" &&
    payload.type !== "data" &&
    payload.type !== "session"
  ) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  const title = typeof payload.title === "string" ? payload.title : "";
  if (!id || !title) {
    return null;
  }
  return {
    id,
    title,
    meta: typeof payload.meta === "string" ? payload.meta : "",
    status: typeof payload.status === "string" ? payload.status : "",
    type: payload.type,
    critical: Boolean(payload.critical),
  };
}

function normalizarItemSuporte(payload: unknown): SupportQueueItem | null {
  if (!ehRegistro(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  const title = typeof payload.title === "string" ? payload.title : "";
  const body = typeof payload.body === "string" ? payload.body : "";
  if (!id || !title || !body) {
    return null;
  }
  return {
    id,
    kind: payload.kind === "feedback" ? "feedback" : "bug",
    title,
    body,
    email: typeof payload.email === "string" ? payload.email : "",
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : new Date().toISOString(),
    status: typeof payload.status === "string" && payload.status.trim() ? payload.status : "Na fila",
    attachmentLabel: typeof payload.attachmentLabel === "string" ? payload.attachmentLabel : undefined,
    attachmentUri: typeof payload.attachmentUri === "string" ? payload.attachmentUri : undefined,
    attachmentKind:
      payload.attachmentKind === "image" || payload.attachmentKind === "document"
        ? payload.attachmentKind
        : undefined,
  };
}

async function lerPreferenciasLocais(): Promise<Record<string, unknown>> {
  try {
    const valor = await FileSystem.readAsStringAsync(APP_PREFERENCES_FILE);
    const payload = JSON.parse(valor);
    return ehRegistro(payload) ? payload : {};
  } catch {
    return {};
  }
}

async function salvarPreferenciasLocais(preferencias: AppPreferencesState): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(APP_PREFERENCES_FILE, JSON.stringify(preferencias));
  } catch (error) {
    console.warn("Falha ao salvar as preferências locais do app.", error);
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
        mimeType: params.extension === "json" ? "application/json" : "text/plain",
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

function obterEscalaDensidade(densidade: (typeof DENSITY_OPTIONS)[number]): number {
  return densidade === "compacta" ? 0.9 : 1;
}

function obterNomeCurto(nomeCompleto: string): string {
  return (nomeCompleto || "").trim().split(/\s+/)[0] || "Inspetor";
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

function normalizarModoChat(modo: unknown, fallback: MobileChatMode = "detalhado"): MobileChatMode {
  const valor = String(modo || "").trim().toLowerCase();
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

function extrairModoConversaDasMensagens(mensagens: MobileChatMessage[]): MobileChatMode {
  for (let index = mensagens.length - 1; index >= 0; index -= 1) {
    const mensagem = mensagens[index];
    if (typeof mensagem?.modo === "string" && mensagem.modo.trim()) {
      return normalizarModoChat(mensagem.modo);
    }
  }
  return "detalhado";
}

function criarMensagemAssistenteServidor(resposta: MobileChatSendResult): MobileChatMessage | null {
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
    modo: normalizarModoChat(payload.modo, extrairModoConversaDasMensagens(mensagens)),
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

function previewChatLiberadoParaConversa(conversa: ChatState | null | undefined): boolean {
  return Boolean(conversa && (!conversa.laudoId || (!conversa.permiteEdicao && !conversa.mensagens.length)));
}

function podeEditarConversaNoComposer(conversa: ChatState | null | undefined): boolean {
  return !conversa || conversa.permiteEdicao || previewChatLiberadoParaConversa(conversa);
}

function obterTonsStatusLaudo(statusCard: string): { fundo: string; texto: string } {
  const mapa: Record<string, { fundo: string; texto: string }> = {
    aberto: { fundo: "#E8F4EC", texto: "#1F7A4C" },
    aguardando: { fundo: "#EEF2F6", texto: "#3D556F" },
    ajustes: { fundo: "#FFF0E5", texto: "#B85A11" },
    aprovado: { fundo: "#EAF7F1", texto: "#187048" },
  };

  return mapa[statusCard] || { fundo: "#EEF2F6", texto: "#3D556F" };
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
  const semSeparadores = base.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
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
  const valor = String(texto || "").trim().replace(/\s+/g, " ");
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

  const mensagemChat = mensagensChat.find((item) => Number(item.id || 0) === alvo);
  if (mensagemChat?.texto?.trim()) {
    return resumoMensagemAtividade(mensagemChat.texto, `Mensagem #${alvo}`);
  }

  const mensagemMesa = mensagensMesa.find((item) => Number(item.id || 0) === alvo);
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
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase())
    .join(" ");
}

function criarNotificacaoStatusLaudo(item: MobileLaudoCard): MobileActivityNotification {
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
    body: mapaDescricao[item.status_card] || `${item.titulo} mudou para ${item.status_card_label}.`,
    createdAt: new Date().toISOString(),
    unread: true,
    targetThread: item.status_card === "ajustes" ? "mesa" : "chat",
  };
}

function criarNotificacaoMesa(
  kind: MobileActivityNotification["kind"],
  mensagemMesa: MobileMesaMessage,
  tituloLaudo: string,
): MobileActivityNotification {
  const mapaTitulo: Record<MobileActivityNotification["kind"], string> = {
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

function reautenticacaoAindaValida(dataIso: string): boolean {
  if (!dataIso) {
    return false;
  }
  const data = new Date(dataIso);
  return !Number.isNaN(data.getTime()) && data.getTime() > Date.now();
}

function formatarStatusReautenticacao(dataIso: string): string {
  if (!reautenticacaoAindaValida(dataIso)) {
    return "Não confirmada";
  }

  const data = new Date(dataIso);
  return `Confirmada até ${data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function obterTimeoutBloqueioMs(value: (typeof LOCK_TIMEOUT_OPTIONS)[number]): number | null {
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

function obterJanelaRetencaoMs(value: (typeof DATA_RETENTION_OPTIONS)[number]): number | null {
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

  const mimeType = (asset.mimeType || "image/jpeg").replace("image/jpg", "image/jpeg");
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

function montarAnexoDocumentoMesa(asset: DocumentPicker.DocumentPickerAsset): ComposerAttachment {
  return montarAnexoDocumentoLocal(asset, "Documento pronto para seguir direto para a mesa avaliadora.");
}

export function InspectorMobileApp() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [statusApi, setStatusApi] = useState<ApiHealthStatus>("checking");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [session, setSession] = useState<MobileSessionState | null>(null);
  const [conversa, setConversa] = useState<ChatState | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<ActiveThread>("chat");
  const [laudosDisponiveis, setLaudosDisponiveis] = useState<MobileLaudoCard[]>([]);
  const [carregandoLaudos, setCarregandoLaudos] = useState(false);
  const [erroLaudos, setErroLaudos] = useState("");
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  const [sincronizandoConversa, setSincronizandoConversa] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [anexoRascunho, setAnexoRascunho] = useState<ComposerAttachment | null>(null);
  const [erroConversa, setErroConversa] = useState("");
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);
  const [preparandoAnexo, setPreparandoAnexo] = useState(false);
  const [mensagensMesa, setMensagensMesa] = useState<MobileMesaMessage[]>([]);
  const [erroMesa, setErroMesa] = useState("");
  const [mensagemMesa, setMensagemMesa] = useState("");
  const [anexoMesaRascunho, setAnexoMesaRascunho] = useState<ComposerAttachment | null>(null);
  const [mensagemMesaReferenciaAtiva, setMensagemMesaReferenciaAtiva] = useState<MessageReferenceState | null>(null);
  const [carregandoMesa, setCarregandoMesa] = useState(false);
  const [sincronizandoMesa, setSincronizandoMesa] = useState(false);
  const [enviandoMesa, setEnviandoMesa] = useState(false);
  const [laudoMesaCarregado, setLaudoMesaCarregado] = useState<number | null>(null);
  const [anexoAbrindoChave, setAnexoAbrindoChave] = useState("");
  const [previewAnexoImagem, setPreviewAnexoImagem] = useState<AttachmentPreviewState | null>(null);
  const [mensagemChatDestacadaId, setMensagemChatDestacadaId] = useState<number | null>(null);
  const [layoutMensagensChatVersao, setLayoutMensagensChatVersao] = useState(0);
  const [filaOffline, setFilaOffline] = useState<OfflinePendingMessage[]>([]);
  const [sincronizandoFilaOffline, setSincronizandoFilaOffline] = useState(false);
  const [sincronizandoItemFilaId, setSincronizandoItemFilaId] = useState("");
  const [notificacoes, setNotificacoes] = useState<MobileActivityNotification[]>([]);
  const [cacheLeitura, setCacheLeitura] = useState<MobileReadCache>(CACHE_LEITURA_VAZIO);
  const [usandoCacheOffline, setUsandoCacheOffline] = useState(false);
  const [centralAtividadeAberta, setCentralAtividadeAberta] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [filtroHistorico, setFiltroHistorico] = useState<HistoryDrawerFilter>("todos");
  const [filaOfflineAberta, setFilaOfflineAberta] = useState(false);
  const [configuracoesAberta, setConfiguracoesAberta] = useState(false);
  const [anexosAberto, setAnexosAberto] = useState(false);
  const [introVisivel, setIntroVisivel] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [filtroFilaOffline, setFiltroFilaOffline] = useState<OfflineQueueFilter>("all");
  const [monitorandoAtividade, setMonitorandoAtividade] = useState(false);
  const [perfilNome, setPerfilNome] = useState("");
  const [perfilExibicao, setPerfilExibicao] = useState("");
  const [perfilFotoUri, setPerfilFotoUri] = useState("");
  const [perfilFotoHint, setPerfilFotoHint] = useState("Toque para atualizar");
  const [laudosFixadosIds, setLaudosFixadosIds] = useState<number[]>([]);
  const [historicoOcultoIds, setHistoricoOcultoIds] = useState<number[]>([]);
  const [emailAtualConta, setEmailAtualConta] = useState("");
  const [novoEmailDraft, setNovoEmailDraft] = useState("");
  const [senhaAtualDraft, setSenhaAtualDraft] = useState("");
  const [novaSenhaDraft, setNovaSenhaDraft] = useState("");
  const [confirmarSenhaDraft, setConfirmarSenhaDraft] = useState("");
  const [planoAtual, setPlanoAtual] = useState<(typeof PLAN_OPTIONS)[number]>("Pro");
  const [cartaoAtual, setCartaoAtual] = useState<(typeof PAYMENT_CARD_OPTIONS)[number]>("Visa final 4242");
  const [modeloIa, setModeloIa] = useState<(typeof AI_MODEL_OPTIONS)[number]>("equilibrado");
  const [estiloResposta, setEstiloResposta] = useState<(typeof RESPONSE_STYLE_OPTIONS)[number]>("detalhado");
  const [idiomaResposta, setIdiomaResposta] = useState<(typeof RESPONSE_LANGUAGE_OPTIONS)[number]>("Português");
  const [memoriaIa, setMemoriaIa] = useState(true);
  const [aprendizadoIa, setAprendizadoIa] = useState(false);
  const [tomConversa, setTomConversa] = useState<(typeof CONVERSATION_TONE_OPTIONS)[number]>("técnico");
  const [temperaturaIa, setTemperaturaIa] = useState<number>(0.4);
  const [temaApp, setTemaApp] = useState<(typeof THEME_OPTIONS)[number]>("claro");
  const [tamanhoFonte, setTamanhoFonte] = useState<(typeof FONT_SIZE_OPTIONS)[number]>("médio");
  const [densidadeInterface, setDensidadeInterface] = useState<(typeof DENSITY_OPTIONS)[number]>("confortável");
  const [corDestaque, setCorDestaque] = useState<(typeof ACCENT_OPTIONS)[number]>("laranja");
  const [animacoesAtivas, setAnimacoesAtivas] = useState(true);
  const [notificaRespostas, setNotificaRespostas] = useState(true);
  const [notificaPush, setNotificaPush] = useState(true);
  const [somNotificacao, setSomNotificacao] = useState<(typeof NOTIFICATION_SOUND_OPTIONS)[number]>("Ping");
  const [vibracaoAtiva, setVibracaoAtiva] = useState(true);
  const [emailsAtivos, setEmailsAtivos] = useState(false);
  const [salvarHistoricoConversas, setSalvarHistoricoConversas] = useState(true);
  const [compartilharMelhoriaIa, setCompartilharMelhoriaIa] = useState(false);
  const [backupAutomatico, setBackupAutomatico] = useState(true);
  const [sincronizacaoDispositivos, setSincronizacaoDispositivos] = useState(true);
  const [nomeAutomaticoConversas, setNomeAutomaticoConversas] = useState(true);
  const [fixarConversas, setFixarConversas] = useState(true);
  const [entradaPorVoz, setEntradaPorVoz] = useState(false);
  const [respostaPorVoz, setRespostaPorVoz] = useState(false);
  const [uploadArquivosAtivo, setUploadArquivosAtivo] = useState(true);
  const [economiaDados, setEconomiaDados] = useState(false);
  const [usoBateria, setUsoBateria] = useState<(typeof BATTERY_OPTIONS)[number]>("Otimizado");
  const [idiomaApp, setIdiomaApp] = useState<(typeof APP_LANGUAGE_OPTIONS)[number]>("Português");
  const [regiaoApp, setRegiaoApp] = useState<(typeof REGION_OPTIONS)[number]>("Brasil");
  const [provedoresConectados, setProvedoresConectados] = useState<ConnectedProvider[]>(() =>
    criarProvedoresConectadosPadrao(),
  );
  const [integracoesExternas, setIntegracoesExternas] = useState<ExternalIntegration[]>(() =>
    criarIntegracoesExternasPadrao(),
  );
  const [sessoesAtivas, setSessoesAtivas] = useState<SessionDevice[]>(() => criarSessoesAtivasPadrao());
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<(typeof TWO_FACTOR_METHOD_OPTIONS)[number]>("App autenticador");
  const [recoveryCodesEnabled, setRecoveryCodesEnabled] = useState(true);
  const [deviceBiometricsEnabled, setDeviceBiometricsEnabled] = useState(true);
  const [requireAuthOnOpen, setRequireAuthOnOpen] = useState(true);
  const [hideInMultitask, setHideInMultitask] = useState(true);
  const [lockTimeout, setLockTimeout] = useState<(typeof LOCK_TIMEOUT_OPTIONS)[number]>("1 minuto");
  const [retencaoDados, setRetencaoDados] = useState<(typeof DATA_RETENTION_OPTIONS)[number]>("90 dias");
  const [codigo2FA, setCodigo2FA] = useState("");
  const [codigosRecuperacao, setCodigosRecuperacao] = useState<string[]>([]);
  const [reautenticacaoStatus, setReautenticacaoStatus] = useState("Não confirmada");
  const [reautenticacaoExpiraEm, setReautenticacaoExpiraEm] = useState("");
  const [reauthReason, setReauthReason] = useState(
    "Confirme sua identidade para liberar ações críticas no app do inspetor.",
  );
  const [filtroEventosSeguranca, setFiltroEventosSeguranca] = useState<SecurityEventFilter>("todos");
  const [eventosSeguranca, setEventosSeguranca] = useState<SecurityEventItem[]>([
    {
      id: "sec-1",
      title: "Novo login autorizado",
      meta: "Pixel 7a • São Paulo, BR",
      status: "Hoje às 12:07",
      type: "login",
    },
    {
      id: "sec-2",
      title: "Conta Microsoft conectada",
      meta: "Conta corporativa vinculada",
      status: "Ontem às 18:41",
      type: "provider",
    },
    {
      id: "sec-3",
      title: "Tentativa sensível pendente de reautenticação",
      meta: "Exportação de dados solicitada",
      status: "Hoje às 10:18",
      type: "data",
      critical: true,
    },
  ]);
  const [mostrarConteudoNotificacao, setMostrarConteudoNotificacao] = useState(false);
  const [ocultarConteudoBloqueado, setOcultarConteudoBloqueado] = useState(true);
  const [mostrarSomenteNovaMensagem, setMostrarSomenteNovaMensagem] = useState(true);
  const [buscaAjuda, setBuscaAjuda] = useState("");
  const [artigoAjudaExpandidoId, setArtigoAjudaExpandidoId] = useState<string>(HELP_CENTER_ARTICLES[0]?.id ?? "");
  const [filaSuporteLocal, setFilaSuporteLocal] = useState<SupportQueueItem[]>([]);
  const [ultimaVerificacaoAtualizacao, setUltimaVerificacaoAtualizacao] = useState("");
  const [statusAtualizacaoApp, setStatusAtualizacaoApp] = useState("Nenhuma verificação recente");
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [bugDescriptionDraft, setBugDescriptionDraft] = useState("");
  const [bugEmailDraft, setBugEmailDraft] = useState("");
  const [bugAttachmentDraft, setBugAttachmentDraft] = useState<ComposerAttachment | null>(null);
  const [integracaoSincronizandoId, setIntegracaoSincronizandoId] = useState<ExternalIntegrationId | "">("");
  const [buscaConfiguracoes, setBuscaConfiguracoes] = useState("");
  const filtroConfiguracoes: SettingsDrawerFilter = "todos";
  const [settingsDrawerPage, setSettingsDrawerPage] = useState<SettingsDrawerPage>("overview");
  const [settingsDrawerSection, setSettingsDrawerSection] = useState<SettingsSectionKey | "all">("all");
  const [settingsSheet, setSettingsSheet] = useState<SettingsSheetState | null>(null);
  const [settingsSheetLoading, setSettingsSheetLoading] = useState(false);
  const [settingsSheetNotice, setSettingsSheetNotice] = useState("");
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheetState | null>(null);
  const [confirmTextDraft, setConfirmTextDraft] = useState("");
  const [bloqueioAppAtivo, setBloqueioAppAtivo] = useState(false);
  const [microfonePermitido, setMicrofonePermitido] = useState(true);
  const [cameraPermitida, setCameraPermitida] = useState(true);
  const [arquivosPermitidos, setArquivosPermitidos] = useState(true);
  const [notificacoesPermitidas, setNotificacoesPermitidas] = useState(true);
  const [biometriaPermitida, setBiometriaPermitida] = useState(true);
  const scrollRef = useRef<ScrollView | null>(null);
  const emailInputRef = useRef<TextInput | null>(null);
  const senhaInputRef = useRef<TextInput | null>(null);
  const chatMessageOffsetsRef = useRef<Record<number, number>>({});
  const chatHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusSnapshotRef = useRef<Record<number, string>>({});
  const mesaSnapshotRef = useRef<Record<number, Record<number, string>>>({});
  const pendingSensitiveActionRef = useRef<(() => void) | null>(null);
  const chatDraftKeyRef = useRef("");
  const mesaDraftKeyRef = useRef("");
  const chatAttachmentDraftKeyRef = useRef("");
  const mesaAttachmentDraftKeyRef = useRef("");
  const historicoDrawerX = useRef(new Animated.Value(HISTORY_PANEL_CLOSED_X)).current;
  const configuracoesDrawerX = useRef(new Animated.Value(SETTINGS_PANEL_CLOSED_X)).current;
  const drawerOverlayOpacity = useRef(new Animated.Value(0)).current;
  const historicoAbertoRef = useRef(false);
  const configuracoesAbertaRef = useRef(false);
  const settingsNavigationHistoryRef = useRef<SettingsNavigationState[]>([]);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundAtRef = useRef<number | null>(null);
  const colorScheme = useColorScheme();

  function limparReferenciaMesaAtiva() {
    setMensagemMesaReferenciaAtiva(null);
  }

  function definirReferenciaMesaAtiva(mensagemAtual: MobileMesaMessage) {
    const referenciaId = Number(mensagemAtual.id || 0) || null;
    if (!referenciaId) {
      limparReferenciaMesaAtiva();
      return;
    }

    setMensagemMesaReferenciaAtiva({
      id: referenciaId,
      texto: resumoMensagemAtividade(mensagemAtual.texto, `Mensagem #${referenciaId}`),
    });
  }

  function registrarLayoutMensagemChat(mensagemId: number | null, offsetY: number) {
    const alvo = Number(mensagemId || 0) || null;
    if (!alvo) {
      return;
    }

    if (chatMessageOffsetsRef.current[alvo] === offsetY) {
      return;
    }

    chatMessageOffsetsRef.current[alvo] = offsetY;
    setLayoutMensagensChatVersao((estadoAtual) => estadoAtual + 1);
  }

  async function abrirReferenciaNoChat(referenciaId: number | null | undefined) {
    const alvo = Number(referenciaId || 0) || null;
    if (!alvo) {
      return;
    }

    if (!conversa?.mensagens.some((item) => Number(item.id || 0) === alvo) && session && conversa?.laudoId) {
      await abrirLaudoPorId(session.accessToken, conversa.laudoId);
    }

    setAbaAtiva("chat");
    setMensagemChatDestacadaId(alvo);
  }

  useEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    historicoAbertoRef.current = historicoAberto;
  }, [historicoAberto]);

  useEffect(() => {
    configuracoesAbertaRef.current = configuracoesAberta;
  }, [configuracoesAberta]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const perfilSessao = mapearUsuarioParaPerfilConta(session.bootstrap.usuario);
    setPerfilNome((estadoAtual) => estadoAtual || perfilSessao.nomeCompleto);
    setPerfilExibicao((estadoAtual) => estadoAtual || perfilSessao.nomeExibicao || obterNomeCurto(perfilSessao.nomeCompleto || ""));
    setEmailAtualConta((estadoAtual) => estadoAtual || perfilSessao.email || email);
    setPerfilFotoUri((estadoAtual) => estadoAtual || perfilSessao.fotoPerfilUri);
    if (perfilSessao.fotoPerfilUri) {
      setPerfilFotoHint((estadoAtual) => estadoAtual || "Foto sincronizada com a conta");
    }
    setProvedoresConectados((estadoAtual) =>
      estadoAtual.map((provider) =>
        provider.connected && !provider.email && session.bootstrap.usuario.email
          ? { ...provider, email: session.bootstrap.usuario.email }
          : provider,
      ),
    );
  }, [email, session]);

  const snapshotConfiguracoesCriticasAtuais = useMemo(
    () => montarSnapshotConfiguracoesCriticasAtuais(),
    [
      arquivosPermitidos,
      biometriaPermitida,
      cameraPermitida,
      compartilharMelhoriaIa,
      emailsAtivos,
      microfonePermitido,
      modeloIa,
      mostrarConteudoNotificacao,
      mostrarSomenteNovaMensagem,
      notificaPush,
      notificaRespostas,
      notificacoesPermitidas,
      ocultarConteudoBloqueado,
      retencaoDados,
      salvarHistoricoConversas,
      somNotificacao,
      vibracaoAtiva,
    ],
  );

  useCriticalSettingsSync({
    accessToken: session?.accessToken,
    carregando,
    snapshotAtual: snapshotConfiguracoesCriticasAtuais,
    aplicarSnapshot: aplicarSnapshotConfiguracoesCriticas,
    onLoadError: (error) => {
      console.warn("Falha ao carregar configuracoes criticas da conta no backend.", error);
    },
    onSaveError: (error) => {
      console.warn("Falha ao sincronizar configuracoes criticas da conta no backend.", error);
    },
  });

  useEffect(() => {
    if (carregando) {
      return;
    }
    void salvarFilaOfflineLocal(filaOffline);
  }, [carregando, filaOffline]);

  useEffect(() => {
    if (carregando) {
      return;
    }
    void salvarNotificacoesLocais(notificacoes);
  }, [carregando, notificacoes]);

  useEffect(() => {
    if (carregando) {
      return;
    }
    if (!backupAutomatico) {
      void salvarCacheLeituraLocal(CACHE_LEITURA_VAZIO);
      return;
    }
    void salvarCacheLeituraLocal(
      salvarHistoricoConversas ? cacheLeitura : limparCachePorPrivacidade(cacheLeitura),
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
    if (carregando) {
      return;
    }

    void salvarPreferenciasLocais({
      perfilNome,
      perfilExibicao,
      perfilFotoUri,
      perfilFotoHint,
      laudosFixadosIds,
      historicoOcultoIds,
      planoAtual,
      cartaoAtual,
      modeloIa,
      estiloResposta,
      idiomaResposta,
      memoriaIa,
      aprendizadoIa,
      tomConversa,
      temperaturaIa,
      temaApp,
      tamanhoFonte,
      densidadeInterface,
      corDestaque,
      animacoesAtivas,
      notificaRespostas,
      notificaPush,
      somNotificacao,
      vibracaoAtiva,
      emailsAtivos,
      salvarHistoricoConversas,
      compartilharMelhoriaIa,
      backupAutomatico,
      sincronizacaoDispositivos,
      nomeAutomaticoConversas,
      fixarConversas,
      entradaPorVoz,
      respostaPorVoz,
      uploadArquivosAtivo,
      economiaDados,
      usoBateria,
      idiomaApp,
      regiaoApp,
      provedoresConectados,
      integracoesExternas,
      sessoesAtivas,
      twoFactorEnabled,
      twoFactorMethod,
      recoveryCodesEnabled,
      deviceBiometricsEnabled,
      requireAuthOnOpen,
      hideInMultitask,
      lockTimeout,
      retencaoDados,
      codigosRecuperacao,
      reautenticacaoStatus,
      reautenticacaoExpiraEm,
      eventosSeguranca,
      mostrarConteudoNotificacao,
      ocultarConteudoBloqueado,
      mostrarSomenteNovaMensagem,
      microfonePermitido,
      cameraPermitida,
      arquivosPermitidos,
      notificacoesPermitidas,
      biometriaPermitida,
      filaSuporteLocal,
      ultimaVerificacaoAtualizacao,
      statusAtualizacaoApp,
    });
  }, [
    animacoesAtivas,
    arquivosPermitidos,
    aprendizadoIa,
    backupAutomatico,
    biometriaPermitida,
    cameraPermitida,
    carregando,
    cartaoAtual,
    codigosRecuperacao,
    compartilharMelhoriaIa,
    corDestaque,
    densidadeInterface,
    deviceBiometricsEnabled,
    economiaDados,
    emailsAtivos,
    entradaPorVoz,
    estiloResposta,
    eventosSeguranca,
    fixarConversas,
    hideInMultitask,
    idiomaApp,
    idiomaResposta,
    integracoesExternas,
    lockTimeout,
    memoriaIa,
    microfonePermitido,
    modeloIa,
    mostrarConteudoNotificacao,
    mostrarSomenteNovaMensagem,
    nomeAutomaticoConversas,
    notificaPush,
    notificaRespostas,
    notificacoesPermitidas,
    ocultarConteudoBloqueado,
    perfilExibicao,
    perfilFotoUri,
    perfilFotoHint,
    perfilNome,
    laudosFixadosIds,
    historicoOcultoIds,
    planoAtual,
    provedoresConectados,
    reautenticacaoExpiraEm,
    reautenticacaoStatus,
    recoveryCodesEnabled,
    regiaoApp,
    requireAuthOnOpen,
    respostaPorVoz,
    retencaoDados,
    salvarHistoricoConversas,
    sessoesAtivas,
    sincronizacaoDispositivos,
    somNotificacao,
    tamanhoFonte,
    temperaturaIa,
    temaApp,
    tomConversa,
    twoFactorEnabled,
    twoFactorMethod,
    uploadArquivosAtivo,
    usoBateria,
    vibracaoAtiva,
    filaSuporteLocal,
    statusAtualizacaoApp,
    ultimaVerificacaoAtualizacao,
  ]);

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

    setReautenticacaoStatus(formatarStatusReautenticacao(reautenticacaoExpiraEm));
    const timeout = setTimeout(() => {
      setReautenticacaoExpiraEm("");
      setReautenticacaoStatus("Não confirmada");
    }, Math.max(0, new Date(reautenticacaoExpiraEm).getTime() - Date.now()));

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
      const laudosFiltrados = filtrarItensPorRetencao(estadoAtual.laudos, janelaMs, (item) => item.data_iso);
      const idsPermitidos = new Set(laudosFiltrados.map((item) => chaveCacheLaudo(item.id)));
      const filtrarPorIds = <T,>(mapa: Record<string, T>): Record<string, T> =>
        Object.fromEntries(Object.entries(mapa).filter(([chave]) => idsPermitidos.has(chave)));
      const conversaAtualValida =
        estadoAtual.conversaAtual?.laudoId && !idsPermitidos.has(chaveCacheLaudo(estadoAtual.conversaAtual.laudoId))
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
    if (!session) {
      setBloqueioAppAtivo(false);
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      const estadoAtual = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "background" || nextState === "inactive") {
        backgroundAtRef.current = Date.now();
        return;
      }

      if (nextState !== "active" || estadoAtual === "active") {
        return;
      }

      if (!requireAuthOnOpen) {
        setBloqueioAppAtivo(false);
        return;
      }

      const timeoutMs = obterTimeoutBloqueioMs(lockTimeout);
      if (timeoutMs === null) {
        setBloqueioAppAtivo(false);
        return;
      }

      const tempoFora = backgroundAtRef.current ? Date.now() - backgroundAtRef.current : Number.POSITIVE_INFINITY;
      if (timeoutMs > 0 && tempoFora < timeoutMs) {
        return;
      }

      if (deviceBiometricsEnabled && reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
        setBloqueioAppAtivo(false);
        return;
      }

      setBloqueioAppAtivo(true);
    });

    return () => {
      subscription.remove();
    };
  }, [deviceBiometricsEnabled, lockTimeout, reautenticacaoExpiraEm, requireAuthOnOpen, session]);

  useEffect(() => {
    if (!bloqueioAppAtivo) {
      return;
    }
    setAnexosAberto(false);
    setCentralAtividadeAberta(false);
    setFilaOfflineAberta(false);
    setPreviewAnexoImagem(null);
    setConfirmSheet(null);
    setSettingsSheet((estadoAtual) => (estadoAtual?.kind === "reauth" ? estadoAtual : null));
    fecharPaineisLaterais();
  }, [bloqueioAppAtivo]);

  useEffect(() => {
    if (notificacoesPermitidas || !notificaPush) {
      return;
    }
    setNotificaPush(false);
  }, [notificaPush, notificacoesPermitidas]);

  useEffect(() => {
    if (biometriaPermitida || !deviceBiometricsEnabled) {
      return;
    }
    setDeviceBiometricsEnabled(false);
  }, [biometriaPermitida, deviceBiometricsEnabled]);

  useEffect(() => {
    if (arquivosPermitidos || !uploadArquivosAtivo) {
      return;
    }
    setUploadArquivosAtivo(false);
  }, [arquivosPermitidos, uploadArquivosAtivo]);

  useEffect(() => {
    if (microfonePermitido || !entradaPorVoz) {
      return;
    }
    setEntradaPorVoz(false);
  }, [entradaPorVoz, microfonePermitido]);

  useEffect(() => {
    if (!session) {
      chatDraftKeyRef.current = "";
      mesaDraftKeyRef.current = "";
      chatAttachmentDraftKeyRef.current = "";
      mesaAttachmentDraftKeyRef.current = "";
      if (carregando) {
        return;
      }
      setConversa(null);
      setMensagem("");
      setErroConversa("");
      setAbaAtiva("chat");
      setLaudosDisponiveis([]);
      setErroLaudos("");
      setMensagensMesa([]);
      setErroMesa("");
      setMensagemMesa("");
      setAnexoMesaRascunho(null);
      setMensagemMesaReferenciaAtiva(null);
      setLaudoMesaCarregado(null);
      setAnexoAbrindoChave("");
      setPreviewAnexoImagem(null);
      setBugAttachmentDraft(null);
      setIntegracaoSincronizandoId("");
      setMensagemChatDestacadaId(null);
      setLayoutMensagensChatVersao(0);
      chatMessageOffsetsRef.current = {};
      setUsandoCacheOffline(false);
      setCentralAtividadeAberta(false);
      setHistoricoAberto(false);
      setConfiguracoesAberta(false);
      setMonitorandoAtividade(false);
      historicoDrawerX.setValue(HISTORY_PANEL_CLOSED_X);
      configuracoesDrawerX.setValue(SETTINGS_PANEL_CLOSED_X);
      drawerOverlayOpacity.setValue(0);
      statusSnapshotRef.current = {};
      mesaSnapshotRef.current = {};
      return;
    }

    void carregarConversaAtual(session.accessToken);
    void carregarListaLaudos(session.accessToken);
  }, [session]);

  useEffect(() => {
    chatMessageOffsetsRef.current = {};
    setLayoutMensagensChatVersao(0);
    setMensagemChatDestacadaId(null);
    setMensagemMesaReferenciaAtiva(null);
  }, [conversa?.laudoId]);

  useEffect(() => {
    if (abaAtiva !== "chat" || !mensagemChatDestacadaId) {
      return;
    }

    const offsetY = chatMessageOffsetsRef.current[mensagemChatDestacadaId];
    if (typeof offsetY !== "number") {
      return;
    }

    const scrollTimeout = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(offsetY - 112, 0),
        animated: true,
      });
    }, 120);

    if (chatHighlightTimeoutRef.current) {
      clearTimeout(chatHighlightTimeoutRef.current);
    }
    chatHighlightTimeoutRef.current = setTimeout(() => {
      setMensagemChatDestacadaId((estadoAtual) =>
        estadoAtual === mensagemChatDestacadaId ? null : estadoAtual,
      );
      chatHighlightTimeoutRef.current = null;
    }, 1800);

    return () => clearTimeout(scrollTimeout);
  }, [abaAtiva, conversa?.mensagens.length, layoutMensagensChatVersao, mensagemChatDestacadaId]);

  useEffect(() => {
    return () => {
      if (chatHighlightTimeoutRef.current) {
        clearTimeout(chatHighlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    const chatLaudoId = conversa?.laudoId ?? null;
    const chatKey = chatLaudoId ? chaveRascunho("chat", chatLaudoId) : "";
    if (chatDraftKeyRef.current !== chatKey) {
      chatDraftKeyRef.current = chatKey;
      setMensagem("");
      setAnexoRascunho(null);
    }
    chatAttachmentDraftKeyRef.current = chatKey;

    const mesaLaudoId = conversa?.laudoId ?? null;
    const mesaKey = mesaLaudoId ? chaveRascunho("mesa", mesaLaudoId) : "";
    if (mesaDraftKeyRef.current !== mesaKey) {
      mesaDraftKeyRef.current = mesaKey;
      setMensagemMesa("");
      setAnexoMesaRascunho(null);
    }
    mesaAttachmentDraftKeyRef.current = mesaKey;
  }, [
    conversa?.laudoId,
    session,
  ]);

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
    if (!session) {
      return;
    }

    if (!conversa?.laudoId) {
      setMensagensMesa([]);
      setErroMesa("");
      setMensagemMesa("");
      setAnexoMesaRascunho(null);
      setLaudoMesaCarregado(null);
      return;
    }

    if (abaAtiva === "mesa" && laudoMesaCarregado !== conversa.laudoId) {
      void carregarMesaAtual(session.accessToken, conversa.laudoId);
    }
  }, [abaAtiva, conversa?.laudoId, laudoMesaCarregado, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);

    return () => clearTimeout(timeout);
  }, [abaAtiva, conversa?.mensagens.length, mensagensMesa.length, session]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

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

  useEffect(() => {
    if (!session || statusApi !== "online" || !filaOffline.length || sincronizandoFilaOffline || !sincronizacaoDispositivos) {
      return;
    }

    if (!filaOffline.some((item) => pendenciaFilaProntaParaReenvio(item))) {
      return;
    }

    void sincronizarFilaOffline(session.accessToken, true);
  }, [filaOffline, session, sincronizandoFilaOffline, sincronizacaoDispositivos, statusApi]);

  useEffect(() => {
    if (!session || statusApi !== "online" || sincronizandoFilaOffline || !filaOffline.length || !sincronizacaoDispositivos) {
      return;
    }

    const proximaPendente = filaOffline
      .map((item) => {
        const proximaTentativa = item.nextRetryAt ? new Date(item.nextRetryAt).getTime() : Number.NaN;
        return {
          id: item.id,
          timestamp: proximaTentativa,
        };
      })
      .filter((item) => !Number.isNaN(item.timestamp) && item.timestamp > Date.now())
      .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (!proximaPendente) {
      return;
    }

    const esperaMs = Math.max(500, proximaPendente.timestamp - Date.now());
    const timeout = setTimeout(() => {
      void sincronizarFilaOffline(session.accessToken, true);
    }, esperaMs);

    return () => clearTimeout(timeout);
  }, [filaOffline, session, sincronizandoFilaOffline, sincronizacaoDispositivos, statusApi]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const statusAtual: Record<number, string> = {};
    for (const item of laudosDisponiveis) {
      statusAtual[item.id] = assinaturaStatusLaudo(item);
    }
    statusSnapshotRef.current = statusAtual;
  }, [laudosDisponiveis, session]);

  useEffect(() => {
    if (!session || !conversa?.laudoId || laudoMesaCarregado !== conversa.laudoId) {
      return;
    }

    mesaSnapshotRef.current[conversa.laudoId] = Object.fromEntries(
      mensagensMesa.map((item) => [item.id, assinaturaMensagemMesa(item)]),
    );
  }, [conversa?.laudoId, laudoMesaCarregado, mensagensMesa, session]);

  useEffect(() => {
    if (!session || !sincronizacaoDispositivos) {
      return;
    }

    const intervaloMonitoramentoMs = obterIntervaloMonitoramentoMs(economiaDados, usoBateria);
    let cancelado = false;
    const intervalo = setInterval(() => {
      if (cancelado) {
        return;
      }

      if (statusApi === "offline") {
        void (async () => {
          const online = await pingApi();
          if (!online || cancelado) {
            return;
          }
          setStatusApi("online");
          await handleRefresh();
        })();
        return;
      }

      void monitorarAtividade(session.accessToken);
    }, intervaloMonitoramentoMs);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [conversa?.laudoId, economiaDados, session, sincronizacaoDispositivos, statusApi, usoBateria]);

  async function bootstrapApp() {
    setCarregando(true);
    setErro("");
    await runBootstrapAppFlow({
      applyLocalPreferences: (preferenciasLocais) => {
        applyLocalPreferencesFromStorage(preferenciasLocais, {
          ehOpcaoValida,
          formatarStatusReautenticacao,
          normalizarEventoSeguranca,
          normalizarIntegracaoExterna,
          normalizarItemSuporte,
          normalizarProviderConectado,
          normalizarSessaoAtiva,
          reautenticacaoAindaValida,
          reconciliarIntegracoesExternas,
          setAnimacoesAtivas,
          setAprendizadoIa,
          setArquivosPermitidos,
          setBackupAutomatico,
          setBiometriaPermitida,
          setBugAttachmentDraft,
          setCameraPermitida,
          setCartaoAtual,
          setCodigosRecuperacao,
          setCompartilharMelhoriaIa,
          setCorDestaque,
          setDensidadeInterface,
          setDeviceBiometricsEnabled,
          setEconomiaDados,
          setEmailAtualConta,
          setEmailsAtivos,
          setEntradaPorVoz,
          setEstiloResposta,
          setEventosSeguranca,
          setFilaSuporteLocal,
          setFixarConversas,
          setHideInMultitask,
          setHistoricoOcultoIds,
          setIdiomaApp,
          setIdiomaResposta,
          setIntegracoesExternas,
          setLaudosFixadosIds,
          setLockTimeout,
          setMemoriaIa,
          setMicrofonePermitido,
          setModeloIa,
          setMostrarConteudoNotificacao,
          setMostrarSomenteNovaMensagem,
          setNomeAutomaticoConversas,
          setNotificaPush,
          setNotificaRespostas,
          setNotificacoesPermitidas,
          setNovaSenhaDraft,
          setOcultarConteudoBloqueado,
          setPerfilExibicao,
          setPerfilFotoHint,
          setPerfilFotoUri,
          setPerfilNome,
          setPlanoAtual,
          setProvedoresConectados,
          setReautenticacaoExpiraEm,
          setReautenticacaoStatus,
          setRecoveryCodesEnabled,
          setRegiaoApp,
          setRequireAuthOnOpen,
          setRespostaPorVoz,
          setRetencaoDados,
          setSalvaHistoricoConversas: setSalvarHistoricoConversas,
          setSessoesAtivas,
          setSincronizacaoDispositivos,
          setSomNotificacao,
          setStatusAtualizacaoApp,
          setTamanhoFonte,
          setTemperaturaIa,
          setTemaApp,
          setTomConversa,
          setTwoFactorEnabled,
          setTwoFactorMethod,
          setUltimaVerificacaoAtualizacao,
          setUploadArquivosAtivo,
          setUsoBateria,
          setVibracaoAtiva,
        });
      },
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
      removeToken: async () => {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      },
      CACHE_LEITURA_VAZIO,
      EMAIL_KEY,
      TOKEN_KEY,
      onSetStatusApi: setStatusApi,
      onSetEmail: setEmail,
      onSetFilaOffline: setFilaOffline,
      onSetNotificacoes: setNotificacoes,
      onSetCacheLeitura: setCacheLeitura,
      onMergeCacheBootstrap: (bootstrap) => {
        setUsandoCacheOffline(false);
        setCacheLeitura((estadoAtual) => ({
          ...estadoAtual,
          bootstrap,
          updatedAt: new Date().toISOString(),
        }));
      },
      onSetSession: setSession,
      onSetUsandoCacheOffline: setUsandoCacheOffline,
      onSetLaudosDisponiveis: setLaudosDisponiveis,
      onSetConversa: setConversa,
      onSetMensagensMesa: setMensagensMesa,
      onSetLaudoMesaCarregado: setLaudoMesaCarregado,
      onSetErroLaudos: setErroLaudos,
    });
    setCarregando(false);
  }

  async function handleLogin() {
    if (!email.trim() || !senha.trim()) {
      setErro("Preencha e-mail e senha para entrar no app.");
      return;
    }

    setEntrando(true);
    setErro("");

    try {
      const login = await loginInspectorMobile(email, senha, lembrar);
      const bootstrap = await carregarBootstrapMobile(login.access_token);

      if (lembrar) {
        await Promise.all([
          salvarItemSeguro(TOKEN_KEY, login.access_token),
          salvarItemSeguro(EMAIL_KEY, email.trim()),
        ]);
      } else {
        await Promise.all([
          removerItemSeguro(TOKEN_KEY),
          removerItemSeguro(EMAIL_KEY),
        ]);
      }

      setSenha("");
      setUsandoCacheOffline(false);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        bootstrap,
        updatedAt: new Date().toISOString(),
      }));
      setBloqueioAppAtivo(false);
      setSession({ accessToken: login.access_token, bootstrap });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao autenticar no app.";
      setErro(message);
    } finally {
      setEntrando(false);
    }
  }

  async function handleRefresh() {
    const online = await pingApi();
    setStatusApi(online ? "online" : "offline");

    if (session) {
      if (online && sincronizacaoDispositivos && filaOffline.some((item) => pendenciaFilaProntaParaReenvio(item))) {
        await sincronizarFilaOffline(session.accessToken, true);
      }
      await carregarListaLaudos(session.accessToken, true);
      const proximaConversa = await carregarConversaAtual(session.accessToken, true);
      const laudoAtual = proximaConversa?.laudoId ?? conversa?.laudoId ?? null;
      if (abaAtiva === "mesa" && laudoAtual) {
        await carregarMesaAtual(session.accessToken, laudoAtual, true);
      }
      if (online) {
        setUsandoCacheOffline(false);
      }
    }
  }

  async function handleLogout() {
    try {
      if (session) {
        await logoutInspectorMobile(session.accessToken);
      }
    } catch {
      // Mantém a saída local mesmo se o backend já tiver expirado o token.
    } finally {
      await removerItemSeguro(TOKEN_KEY);
      setCacheLeitura(CACHE_LEITURA_VAZIO);
      setSession(null);
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
      setLaudoMesaCarregado(null);
      setNotificacoes([]);
      setAnexoAbrindoChave("");
      setPreviewAnexoImagem(null);
      setBugAttachmentDraft(null);
      setIntegracaoSincronizandoId("");
      setBloqueioAppAtivo(false);
    }
  }

  async function limparPersistenciaContaLocal(): Promise<void> {
    await Promise.all([
      removerItemSeguro(EMAIL_KEY),
      FileSystem.deleteAsync(OFFLINE_QUEUE_FILE, { idempotent: true }),
      FileSystem.deleteAsync(NOTIFICATIONS_FILE, { idempotent: true }),
      FileSystem.deleteAsync(READ_CACHE_FILE, { idempotent: true }),
      FileSystem.deleteAsync(APP_PREFERENCES_FILE, { idempotent: true }),
    ]);
  }

  function resetarPreferenciasContaPosExclusao() {
    setEmail("");
    setPerfilNome("");
    setPerfilExibicao("");
    setPerfilFotoUri("");
    setPerfilFotoHint("Toque para atualizar");
    setEmailAtualConta("");
    setNovoEmailDraft("");
    setSenhaAtualDraft("");
    setNovaSenhaDraft("");
    setConfirmarSenhaDraft("");
    setPlanoAtual("Pro");
    setCartaoAtual("Visa final 4242");
    setModeloIa("equilibrado");
    setEstiloResposta("detalhado");
    setIdiomaResposta("Português");
    setMemoriaIa(true);
    setAprendizadoIa(false);
    setTomConversa("técnico");
    setTemperaturaIa(0.4);
    setTemaApp("claro");
    setTamanhoFonte("médio");
    setDensidadeInterface("confortável");
    setCorDestaque("laranja");
    setAnimacoesAtivas(true);
    setNotificaRespostas(true);
    setNotificaPush(true);
    setSomNotificacao("Ping");
    setVibracaoAtiva(true);
    setEmailsAtivos(false);
    setSalvarHistoricoConversas(true);
    setCompartilharMelhoriaIa(false);
    setBackupAutomatico(true);
    setSincronizacaoDispositivos(true);
    setNomeAutomaticoConversas(true);
    setFixarConversas(true);
    setEntradaPorVoz(false);
    setRespostaPorVoz(false);
    setUploadArquivosAtivo(true);
    setEconomiaDados(false);
    setUsoBateria("Otimizado");
    setIdiomaApp("Português");
    setRegiaoApp("Brasil");
    setLaudosFixadosIds([]);
    setHistoricoOcultoIds([]);
    setProvedoresConectados(criarProvedoresConectadosPadrao());
    setIntegracoesExternas(criarIntegracoesExternasPadrao());
    setSessoesAtivas(criarSessoesAtivasPadrao());
    setTwoFactorEnabled(false);
    setTwoFactorMethod("App autenticador");
    setRecoveryCodesEnabled(true);
    setDeviceBiometricsEnabled(true);
    setRequireAuthOnOpen(true);
    setHideInMultitask(true);
    setLockTimeout("1 minuto");
    setRetencaoDados("90 dias");
    setCodigosRecuperacao([]);
    setCodigo2FA("");
    setReautenticacaoExpiraEm("");
    setReautenticacaoStatus("Não confirmada");
    setMostrarConteudoNotificacao(false);
    setOcultarConteudoBloqueado(true);
    setMostrarSomenteNovaMensagem(true);
    setMicrofonePermitido(true);
    setCameraPermitida(true);
    setArquivosPermitidos(true);
    setNotificacoesPermitidas(true);
    setBiometriaPermitida(true);
    setFilaSuporteLocal([]);
    setEventosSeguranca([]);
    setFeedbackDraft("");
    setBugDescriptionDraft("");
    setBugEmailDraft("");
    setBugAttachmentDraft(null);
    setUltimaVerificacaoAtualizacao("");
    setStatusAtualizacaoApp("Nenhuma verificação recente");
    setBuscaAjuda("");
    setArtigoAjudaExpandidoId(HELP_CENTER_ARTICLES[0]?.id ?? "");
  }

  async function executarExclusaoContaLocal() {
    setCarregando(true);
    fecharConfiguracoes();
    try {
      await limparPersistenciaContaLocal();
      await handleLogout();
      resetarPreferenciasContaPosExclusao();
      Alert.alert(
        "Conta excluída neste dispositivo",
        "Sessão encerrada e dados locais removidos. Faça login novamente apenas se a conta estiver ativa.",
      );
    } catch (error) {
      const mensagem =
        error instanceof Error ? error.message : "Não foi possível concluir a exclusão local da conta.";
      Alert.alert("Exclusão incompleta", mensagem);
    } finally {
      setCarregando(false);
    }
  }

  async function carregarConversaAtual(accessToken: string, silencioso = false): Promise<ChatState | null> {
    if (silencioso) {
      setSincronizandoConversa(true);
    } else {
      setCarregandoConversa(true);
    }
    setErroConversa("");

    try {
      const status = await carregarStatusLaudo(accessToken);
      let proximaConversa = normalizarConversa(status);

      if (status.laudo_id) {
        const historico = await carregarMensagensLaudo(accessToken, status.laudo_id);
        proximaConversa = normalizarConversa(historico);
      }

      setConversa(proximaConversa);
      setUsandoCacheOffline(false);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        conversaAtual: proximaConversa,
        conversasPorLaudo: {
          ...estadoAtual.conversasPorLaudo,
          [chaveCacheLaudo(proximaConversa.laudoId)]: proximaConversa,
        },
        updatedAt: new Date().toISOString(),
      }));
      if (proximaConversa.laudoId !== laudoMesaCarregado) {
        setMensagensMesa([]);
        setErroMesa("");
        setMensagemMesa("");
        setLaudoMesaCarregado(null);
      }
      return proximaConversa;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível atualizar a conversa do inspetor.";
      const emModoOffline = statusApi === "offline" || erroSugereModoOffline(error);
      const cacheKey = chaveCacheLaudo(conversa?.laudoId ?? null);
      const conversaCache = cacheLeitura.conversasPorLaudo[cacheKey] || cacheLeitura.conversaAtual;
      if (emModoOffline && conversaCache) {
        setConversa(conversaCache);
        setUsandoCacheOffline(true);
        setErroConversa("");
        return conversaCache;
      }
      setErroConversa(message);
      return null;
    } finally {
      setCarregandoConversa(false);
      setSincronizandoConversa(false);
    }
  }

  async function carregarListaLaudos(accessToken: string, silencioso = false): Promise<MobileLaudoCard[]> {
    if (!silencioso) {
      setCarregandoLaudos(true);
    }
    setErroLaudos("");

    try {
      const payload = await carregarLaudosMobile(accessToken);
      const laudosNormalizados = aplicarPreferenciasLaudos(payload.itens || [], laudosFixadosIds, historicoOcultoIds);
      setLaudosDisponiveis(laudosNormalizados);
      setUsandoCacheOffline(false);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        laudos: laudosNormalizados,
        updatedAt: new Date().toISOString(),
      }));
      return laudosNormalizados;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar os laudos do inspetor.";
      const emModoOffline = statusApi === "offline" || erroSugereModoOffline(error);
      if (emModoOffline && cacheLeitura.laudos.length) {
        const laudosCache = aplicarPreferenciasLaudos(cacheLeitura.laudos, laudosFixadosIds, historicoOcultoIds);
        setLaudosDisponiveis(laudosCache);
        setUsandoCacheOffline(true);
        setErroLaudos("");
        return laudosCache;
      }
      setErroLaudos(message);
      return [];
    } finally {
      setCarregandoLaudos(false);
    }
  }

  async function carregarMesaAtual(accessToken: string, laudoId: number, silencioso = false) {
    if (silencioso) {
      setSincronizandoMesa(true);
    } else {
      setCarregandoMesa(true);
    }
    setErroMesa("");

    try {
      const payload = await carregarMensagensMesaMobile(accessToken, laudoId);
      setMensagensMesa(payload.itens || []);
      setLaudoMesaCarregado(laudoId);
      setUsandoCacheOffline(false);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        mesaPorLaudo: {
          ...estadoAtual.mesaPorLaudo,
          [chaveCacheLaudo(laudoId)]: payload.itens || [],
        },
        updatedAt: new Date().toISOString(),
      }));
      setConversa((estadoAtual) => atualizarResumoLaudoAtual(estadoAtual, payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir a conversa da mesa.";
      const mesaCache = cacheLeitura.mesaPorLaudo[chaveCacheLaudo(laudoId)] || [];
      const emModoOffline = statusApi === "offline" || erroSugereModoOffline(error);
      if (emModoOffline && mesaCache.length) {
        setMensagensMesa(mesaCache);
        setLaudoMesaCarregado(laudoId);
        setUsandoCacheOffline(true);
        setErroMesa("");
        return;
      }
      setErroMesa(message);
    } finally {
      setCarregandoMesa(false);
      setSincronizandoMesa(false);
    }
  }

  async function handleAbrirAnexo(anexo: MobileAttachment) {
    if (!session) {
      return;
    }

    const absoluteUrl = urlAnexoAbsoluta(anexo.url);
    if (!absoluteUrl) {
      Alert.alert("Anexo", "Esse anexo ainda não está disponível para abertura no app.");
      return;
    }

    if (ehImagemAnexo(anexo)) {
      setPreviewAnexoImagem({
        titulo: nomeExibicaoAnexo(anexo, "Imagem"),
        uri: absoluteUrl,
      });
      return;
    }

    const key = chaveAnexo(anexo, "anexo");
    setAnexoAbrindoChave(key);

    try {
      const baseDir = `${FileSystem.cacheDirectory || ""}tariel-anexos`;
      await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });

      const extensao = inferirExtensaoAnexo(anexo);
      const nomeBase = nomeArquivoSeguro(nomeExibicaoAnexo(anexo, "anexo"), `anexo${extensao}`);
      const nomeFinal = extensao && !nomeBase.toLowerCase().endsWith(extensao.toLowerCase()) ? `${nomeBase}${extensao}` : nomeBase;
      const destino = `${baseDir}/${Date.now()}-${nomeFinal}`;

      const resultado = await FileSystem.downloadAsync(absoluteUrl, destino, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      });

      const sharingDisponivel = await Sharing.isAvailableAsync();
      if (!sharingDisponivel) {
        Alert.alert("Anexo pronto", `Arquivo salvo em ${resultado.uri}`);
        return;
      }

      await Sharing.shareAsync(resultado.uri, {
        mimeType: anexo.mime_type || undefined,
        dialogTitle: `Abrir ${nomeExibicaoAnexo(anexo, "anexo")}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir o anexo no app.";
      Alert.alert("Anexo", message);
    } finally {
      setAnexoAbrindoChave((estadoAtual) => (estadoAtual === key ? "" : estadoAtual));
    }
  }

  function removerItemFilaOffline(id: string) {
    setFilaOffline((estadoAtual) => estadoAtual.filter((item) => item.id !== id));
  }

  function atualizarItemFilaOffline(
    id: string,
    atualizacao: Partial<Pick<OfflinePendingMessage, "attempts" | "lastAttemptAt" | "lastError" | "nextRetryAt">>,
  ) {
    setFilaOffline((estadoAtual) =>
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

  async function handleRetomarItemFilaOffline(item: OfflinePendingMessage) {
    if (!session) {
      return;
    }

    try {
      setFilaOfflineAberta(false);
      setErroConversa("");
      setErroMesa("");

      if (item.channel === "chat") {
        setAbaAtiva("chat");
        if (item.laudoId) {
          await abrirLaudoPorId(session.accessToken, item.laudoId);
        } else {
          await handleSelecionarLaudo(null);
        }
        setMensagem(item.text);
        setAnexoRascunho(duplicarComposerAttachment(item.attachment));
      } else {
        if (!item.laudoId) {
          removerItemFilaOffline(item.id);
          return;
        }
        await abrirLaudoPorId(session.accessToken, item.laudoId);
        setAbaAtiva("mesa");
        await carregarMesaAtual(session.accessToken, item.laudoId, true);
        setMensagemMesa(item.text);
        setAnexoMesaRascunho(duplicarComposerAttachment(item.attachment));
        if (item.referenceMessageId) {
          setMensagemMesaReferenciaAtiva({
            id: item.referenceMessageId,
            texto: obterResumoReferenciaMensagem(
              item.referenceMessageId,
              conversa?.mensagens || [],
              mensagensMesa,
            ),
          });
        }
      }

      removerItemFilaOffline(item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível retomar essa pendência local.";
      if (item.channel === "mesa") {
        setErroMesa(message);
      } else {
        setErroConversa(message);
      }
    }
  }

  async function enviarPendenciaOffline(
    accessToken: string,
    item: OfflinePendingMessage,
    laudoSequencial: number | null,
  ): Promise<number | null> {
    if (item.channel === "mesa") {
      if (!item.laudoId) {
        return laudoSequencial;
      }

      if (item.attachment) {
        await enviarAnexoMesaMobile(accessToken, item.laudoId, {
          uri: item.attachment.fileUri,
          nome: item.attachment.kind === "document" ? item.attachment.nomeDocumento : item.attachment.label,
          mimeType: item.attachment.mimeType,
          texto: item.text,
          referenciaMensagemId: item.referenceMessageId,
        });
      } else {
        await enviarMensagemMesaMobile(accessToken, item.laudoId, item.text, item.referenceMessageId);
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

    const resposta = await enviarMensagemChatMobile(accessToken, {
      mensagem: item.text,
      dadosImagem,
      setor: conversa?.laudoId && conversa.laudoId === laudoIdAtual ? inferirSetorConversa(conversa) : "geral",
      textoDocumento,
      nomeDocumento,
      laudoId: laudoIdAtual,
      modo: normalizarModoChat(conversa?.modo),
      historico:
        conversa?.laudoId && conversa.laudoId === laudoIdAtual
          ? montarHistoricoParaEnvio(conversa.mensagens)
          : [],
    });
    return resposta.laudoId ?? laudoSequencial;
  }

  async function sincronizarItemFilaOffline(item: OfflinePendingMessage) {
    if (!session || sincronizandoFilaOffline || sincronizandoItemFilaId) {
      return;
    }
    if (!sincronizacaoDispositivos) {
      const mensagem = "Ative a sincronização entre dispositivos para reenviar itens da fila offline.";
      setErroConversa(mensagem);
      setErroMesa(mensagem);
      return;
    }

    setErroConversa("");
    setErroMesa("");
    setSincronizandoItemFilaId(item.id);
    const tentativaEm = new Date().toISOString();
    const proximaTentativa = item.attempts + 1;
    atualizarItemFilaOffline(item.id, {
      attempts: proximaTentativa,
      lastAttemptAt: tentativaEm,
      lastError: "",
      nextRetryAt: "",
    });

    try {
      const laudoResultado = await enviarPendenciaOffline(session.accessToken, item, null);
      removerItemFilaOffline(item.id);
      await carregarListaLaudos(session.accessToken, true);
      const proximaConversa = await carregarConversaAtual(session.accessToken, true);
      const laudoAtual = item.laudoId ?? laudoResultado ?? proximaConversa?.laudoId ?? null;
      if ((item.channel === "mesa" || abaAtiva === "mesa") && laudoAtual) {
        await carregarMesaAtual(session.accessToken, laudoAtual, true);
      }
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_item_sync",
        ok: true,
        count: 1,
        detail: `${item.channel}_attempt_${proximaTentativa}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível reenviar essa pendência.";
      const proximaTentativaEm = new Date(Date.now() + calcularBackoffPendenciaOfflineMs(proximaTentativa)).toISOString();
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
      if (erroSugereModoOffline(error)) {
        setStatusApi("offline");
      }
      if (item.channel === "mesa") {
        setErroMesa(message);
      } else {
        setErroConversa(message);
      }
    } finally {
      setSincronizandoItemFilaId("");
    }
  }

  async function sincronizarFilaOffline(accessToken: string, silencioso = false) {
    if (!filaOffline.length || sincronizandoFilaOffline) {
      return;
    }
    if (!sincronizacaoDispositivos) {
      if (!silencioso) {
        const mensagem = "Sincronização entre dispositivos desativada. Ative essa opção para enviar a fila offline.";
        setErroConversa(mensagem);
        setErroMesa(mensagem);
      }
      return;
    }

    if (!silencioso) {
      setErroConversa("");
      setErroMesa("");
    }
    setSincronizandoFilaOffline(true);

    let restante = [...filaOffline];
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

        if (!pendenciaFilaProntaParaReenvio(item, referencia)) {
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
          laudoSequencial = await enviarPendenciaOffline(accessToken, item, laudoSequencial);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível sincronizar a fila local.";
          const proximaTentativaEm = new Date(Date.now() + calcularBackoffPendenciaOfflineMs(proximaTentativa)).toISOString();
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

      await carregarListaLaudos(accessToken, true);
      const proximaConversa = await carregarConversaAtual(accessToken, true);
      const laudoAtual = proximaConversa?.laudoId ?? laudoSequencial ?? null;
      if (abaAtiva === "mesa" && laudoAtual) {
        await carregarMesaAtual(accessToken, laudoAtual, true);
      }
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_sync",
        ok: true,
        count: itensSincronizados,
        detail: `${itensSincronizados}/${itensTentados}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível sincronizar a fila local.";
      setErroConversa(message);
      setErroMesa(message);
      void registrarEventoObservabilidade({
        kind: "offline_queue",
        name: "offline_queue_sync",
        ok: false,
        count: itensSincronizados,
        detail: message,
      });
      if (erroSugereModoOffline(error)) {
        setStatusApi("offline");
      }
    } finally {
      setSincronizandoFilaOffline(false);
    }
  }

  function registrarNotificacoes(novas: MobileActivityNotification[]) {
    if (!novas.length) {
      return;
    }

    if (!notificacoesPermitidas || !notificaPush) {
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_dispatch_blocked",
        ok: false,
        count: novas.length,
        detail: !notificacoesPermitidas ? "permission_denied" : "push_disabled",
      });
      return;
    }

    const novasFiltradas = notificaRespostas
      ? novas
      : novas.filter((item) => item.kind === "status");
    if (!novasFiltradas.length) {
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_dispatch_filtered",
        ok: true,
        count: novas.length,
        detail: "responses_disabled",
      });
      return;
    }

    const novasNormalizadas = novasFiltradas.map((item) => {
      let body = item.body;
      if (mostrarSomenteNovaMensagem) {
        body = "Nova mensagem";
      } else if (!mostrarConteudoNotificacao || ocultarConteudoBloqueado) {
        body = item.kind === "status" ? "Há uma atualização no laudo." : "Há uma nova interação na conversa.";
      }

      return {
        ...item,
        body,
      };
    });

    setNotificacoes((estadoAtual) => {
      const mapa = new Map(estadoAtual.map((item) => [item.id, item]));
      for (const item of novasNormalizadas) {
        if (!mapa.has(item.id)) {
          mapa.set(item.id, item);
        }
      }

      return Array.from(mapa.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_NOTIFICATIONS);
    });
    void registrarEventoObservabilidade({
      kind: "push",
      name: "push_dispatch",
      ok: true,
      count: novasNormalizadas.length,
      detail: mostrarSomenteNovaMensagem ? "preview_hidden" : "preview_visible",
    });
  }

  function marcarCentralAtividadeComoLida() {
    setNotificacoes((estadoAtual) =>
      estadoAtual.map((item) => (item.unread ? { ...item, unread: false } : item)),
    );
  }

  function animarPainelLateral(
    valor: Animated.Value,
    toValue: number,
    onEnd?: () => void,
  ) {
    Animated.timing(valor, {
      toValue,
      duration: PANEL_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && onEnd) {
        onEnd();
      }
    });
  }

  function fecharHistorico(options?: { limparBusca?: boolean; manterOverlay?: boolean }) {
    if (!historicoAbertoRef.current && !historicoAberto) {
      historicoAbertoRef.current = false;
      if (options?.limparBusca) {
        setBuscaHistorico("");
      }
      historicoDrawerX.setValue(HISTORY_PANEL_CLOSED_X);
      if (!options?.manterOverlay && !configuracoesAbertaRef.current) {
        drawerOverlayOpacity.setValue(0);
      }
      return;
    }

    historicoAbertoRef.current = false;
    animarPainelLateral(historicoDrawerX, HISTORY_PANEL_CLOSED_X, () => {
      setHistoricoAberto(false);
      if (options?.limparBusca) {
        setBuscaHistorico("");
      }
    });

    if (!options?.manterOverlay && !configuracoesAbertaRef.current) {
      Animated.timing(drawerOverlayOpacity, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }

  function fecharConfiguracoes(options?: { manterOverlay?: boolean }) {
    if (!configuracoesAbertaRef.current && !configuracoesAberta) {
      configuracoesAbertaRef.current = false;
      configuracoesDrawerX.setValue(SETTINGS_PANEL_CLOSED_X);
      setSettingsDrawerPage("overview");
      setSettingsDrawerSection("all");
      settingsNavigationHistoryRef.current = [];
      if (!options?.manterOverlay && !historicoAbertoRef.current) {
        drawerOverlayOpacity.setValue(0);
      }
      return;
    }

    configuracoesAbertaRef.current = false;
    animarPainelLateral(configuracoesDrawerX, SETTINGS_PANEL_CLOSED_X, () => {
      setConfiguracoesAberta(false);
      setSettingsDrawerPage("overview");
      setSettingsDrawerSection("all");
      settingsNavigationHistoryRef.current = [];
    });

    if (!options?.manterOverlay && !historicoAbertoRef.current) {
      Animated.timing(drawerOverlayOpacity, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }

  function fecharPaineisLaterais() {
    if (historicoAbertoRef.current) {
      fecharHistorico({ limparBusca: true, manterOverlay: configuracoesAbertaRef.current });
    }
    if (configuracoesAbertaRef.current) {
      fecharConfiguracoes({ manterOverlay: historicoAbertoRef.current });
    }
  }

  function abrirHistorico() {
    if (configuracoesAbertaRef.current) {
      configuracoesAbertaRef.current = false;
      setConfiguracoesAberta(false);
      configuracoesDrawerX.setValue(SETTINGS_PANEL_CLOSED_X);
    }
    historicoAbertoRef.current = true;
    setHistoricoAberto(true);
    Animated.parallel([
      Animated.timing(drawerOverlayOpacity, {
        toValue: 1,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(historicoDrawerX, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function abrirConfiguracoes() {
    if (historicoAbertoRef.current) {
      historicoAbertoRef.current = false;
      setHistoricoAberto(false);
      historicoDrawerX.setValue(HISTORY_PANEL_CLOSED_X);
    }
    setSettingsDrawerPage("overview");
    setSettingsDrawerSection("all");
    settingsNavigationHistoryRef.current = [];
    configuracoesAbertaRef.current = true;
    setConfiguracoesAberta(true);
    Animated.parallel([
      Animated.timing(drawerOverlayOpacity, {
        toValue: 1,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(configuracoesDrawerX, {
        toValue: 0,
        duration: PANEL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function handleAbrirCentralAtividade() {
    setCentralAtividadeAberta(true);
    marcarCentralAtividadeComoLida();
  }

  function handleAbrirConfiguracoes() {
    if (configuracoesAberta || configuracoesAbertaRef.current) {
      fecharConfiguracoes();
      return;
    }
    abrirConfiguracoes();
  }

  function handleAbrirPaginaConfiguracoes(page: SettingsDrawerPage, section: SettingsSectionKey | "all" = "all") {
    if (settingsDrawerPage === page && settingsDrawerSection === section) {
      return;
    }
    pushSettingsNavigationState(settingsNavigationHistoryRef, {
      page: settingsDrawerPage,
      section: settingsDrawerSection,
    });
    setSettingsDrawerPage(page);
    setSettingsDrawerSection(section);
  }

  function handleAbrirSecaoConfiguracoes(section: SettingsSectionKey) {
    if (settingsDrawerSection === section) {
      return;
    }
    pushSettingsNavigationState(settingsNavigationHistoryRef, {
      page: settingsDrawerPage,
      section: settingsDrawerSection,
    });
    setSettingsDrawerSection(section);
  }

  function handleVoltarResumoConfiguracoes() {
    const anterior = settingsNavigationHistoryRef.current.pop();
    if (anterior) {
      setSettingsDrawerPage(anterior.page);
      setSettingsDrawerSection(anterior.section);
      return;
    }

    if (settingsDrawerSection !== "all") {
      setSettingsDrawerSection("all");
      return;
    }
    setSettingsDrawerPage("overview");
    setSettingsDrawerSection("all");
  }

  function handleDesbloquearAplicativo() {
    if (!session) {
      setBloqueioAppAtivo(false);
      return;
    }

    if (!requireAuthOnOpen || reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
      setBloqueioAppAtivo(false);
      return;
    }

    abrirFluxoReautenticacao("Confirme sua identidade para desbloquear o app do inspetor.", () => {
      setBloqueioAppAtivo(false);
    });
  }

  function registrarEventoSegurancaLocal(evento: Omit<SecurityEventItem, "id">) {
    setEventosSeguranca((estadoAtual) => [
      {
        id: `security-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        ...evento,
      },
      ...estadoAtual,
    ].slice(0, 20));
  }

  function abrirSheetConfiguracao(config: SettingsSheetState) {
    setSettingsSheetNotice("");
    setSettingsSheetLoading(false);
    setSettingsSheet(config);
  }

  function fecharSheetConfiguracao() {
    setSettingsSheet(null);
    setSettingsSheetLoading(false);
    setSettingsSheetNotice("");
  }

  function abrirConfirmacaoConfiguracao(config: ConfirmSheetState) {
    setConfirmTextDraft("");
    setConfirmSheet(config);
  }

  function fecharConfirmacaoConfiguracao() {
    setConfirmTextDraft("");
    setConfirmSheet(null);
  }

  function notificarConfiguracaoConcluida(mensagem: string) {
    setSettingsSheetNotice(mensagem);
  }

  function abrirFluxoReautenticacao(motivo: string, onSuccess?: () => void) {
    pendingSensitiveActionRef.current = onSuccess || null;
    setReauthReason(motivo);
    abrirSheetConfiguracao({
      kind: "reauth",
      title: "Confirmar identidade",
      subtitle: "Antes de continuar, valide a identidade do inspetor para proteger ações sensíveis.",
      actionLabel: "Confirmar agora",
    });
  }

  function executarComReautenticacao(motivo: string, onSuccess: () => void) {
    if (reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
      onSuccess();
      return;
    }
    abrirFluxoReautenticacao(motivo, onSuccess);
  }

  function aplicarPerfilSincronizadoNoEstado(perfil: PerfilContaSincronizado) {
    setPerfilNome(perfil.nomeCompleto);
    if (perfil.nomeExibicao) {
      setPerfilExibicao((estadoAtual) => estadoAtual || perfil.nomeExibicao);
    }
    setEmailAtualConta(perfil.email);
    if (perfil.fotoPerfilUri) {
      setPerfilFotoUri(perfil.fotoPerfilUri);
      setPerfilFotoHint("Foto sincronizada com a conta");
    }
    setSession((estadoAtual) => {
      if (!estadoAtual) {
        return estadoAtual;
      }
      return {
        ...estadoAtual,
        bootstrap: {
          ...estadoAtual.bootstrap,
          usuario: {
            ...estadoAtual.bootstrap.usuario,
            nome_completo: perfil.nomeCompleto,
            email: perfil.email,
            telefone: perfil.telefone,
            foto_perfil_url: perfil.fotoPerfilUri,
          },
        },
      };
    });
    setProvedoresConectados((estadoAtual) =>
      estadoAtual.map((provider) =>
        provider.connected
          ? {
              ...provider,
              email: perfil.email || provider.email,
            }
          : provider,
      ),
    );
  }

  function montarSnapshotConfiguracoesCriticasAtuais(): CriticalSettingsSnapshot {
    return {
      notificacoes: {
        notificaRespostas: notificaRespostas,
        notificaPush: notificaPush,
        somNotificacao: somNotificacao,
        vibracaoAtiva: vibracaoAtiva,
        emailsAtivos: emailsAtivos,
      },
      privacidade: {
        mostrarConteudoNotificacao: mostrarConteudoNotificacao,
        ocultarConteudoBloqueado: ocultarConteudoBloqueado,
        mostrarSomenteNovaMensagem: mostrarSomenteNovaMensagem,
        salvarHistoricoConversas: salvarHistoricoConversas,
        compartilharMelhoriaIa: compartilharMelhoriaIa,
        retencaoDados: retencaoDados,
      },
      permissoes: {
        microfonePermitido: microfonePermitido,
        cameraPermitida: cameraPermitida,
        arquivosPermitidos: arquivosPermitidos,
        notificacoesPermitidas: notificacoesPermitidas,
        biometriaPermitida: biometriaPermitida,
      },
      experienciaIa: {
        modeloIa: modeloIa,
      },
    };
  }

  function aplicarSnapshotConfiguracoesCriticas(snapshot: CriticalSettingsSnapshot) {
    setNotificaRespostas(snapshot.notificacoes.notificaRespostas);
    setNotificaPush(snapshot.notificacoes.notificaPush);
    if (ehOpcaoValida(snapshot.notificacoes.somNotificacao, NOTIFICATION_SOUND_OPTIONS)) {
      setSomNotificacao(snapshot.notificacoes.somNotificacao);
    }
    setVibracaoAtiva(snapshot.notificacoes.vibracaoAtiva);
    setEmailsAtivos(snapshot.notificacoes.emailsAtivos);

    setMostrarConteudoNotificacao(snapshot.privacidade.mostrarConteudoNotificacao);
    setOcultarConteudoBloqueado(snapshot.privacidade.ocultarConteudoBloqueado);
    setMostrarSomenteNovaMensagem(snapshot.privacidade.mostrarSomenteNovaMensagem);
    setSalvarHistoricoConversas(snapshot.privacidade.salvarHistoricoConversas);
    setCompartilharMelhoriaIa(snapshot.privacidade.compartilharMelhoriaIa);
    if (ehOpcaoValida(snapshot.privacidade.retencaoDados, DATA_RETENTION_OPTIONS)) {
      setRetencaoDados(snapshot.privacidade.retencaoDados);
    }

    setMicrofonePermitido(snapshot.permissoes.microfonePermitido);
    setCameraPermitida(snapshot.permissoes.cameraPermitida);
    setArquivosPermitidos(snapshot.permissoes.arquivosPermitidos);
    setNotificacoesPermitidas(snapshot.permissoes.notificacoesPermitidas);
    setBiometriaPermitida(snapshot.permissoes.biometriaPermitida);
    if (ehOpcaoValida(snapshot.experienciaIa.modeloIa, AI_MODEL_OPTIONS)) {
      setModeloIa(snapshot.experienciaIa.modeloIa);
    }
  }

  async function handleConfirmarSettingsSheet() {
    if (!settingsSheet) {
      return;
    }

    setSettingsSheetLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 420));

    switch (settingsSheet.kind) {
      case "reauth": {
        const expiracao = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const status = formatarStatusReautenticacao(expiracao);
        setReautenticacaoExpiraEm(expiracao);
        setReautenticacaoStatus(status);
        registrarEventoSegurancaLocal({
          title: "Reautenticação concluída",
          meta: "Janela temporária liberada para ações sensíveis",
          status: "Agora",
          type: "login",
        });
        const pendingAction = pendingSensitiveActionRef.current;
        pendingSensitiveActionRef.current = null;
        if (pendingAction) {
          setSettingsSheetLoading(false);
          setSettingsSheetNotice("Identidade confirmada. O fluxo protegido será liberado agora.");
          setTimeout(() => {
            fecharSheetConfiguracao();
            pendingAction();
          }, 180);
          return;
        }
        notificarConfiguracaoConcluida("Identidade confirmada. Ações sensíveis ficam liberadas por 15 minutos.");
        break;
      }
      case "photo":
        try {
          const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permissao.granted && permissao.accessPrivileges !== "limited") {
            setSettingsSheetLoading(false);
            setSettingsSheetNotice("Permita acesso às imagens para atualizar a foto de perfil.");
            return;
          }

          const resultado = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

          if (resultado.canceled || !resultado.assets?.length) {
            setSettingsSheetLoading(false);
            setSettingsSheetNotice("Seleção cancelada. Escolha uma imagem para atualizar o perfil.");
            return;
          }

          const asset = resultado.assets[0];
          setPerfilFotoUri(asset.uri);
          setPerfilFotoHint("Foto atualizada neste dispositivo");
          if (session) {
            try {
              const nomeArquivo =
                typeof asset.fileName === "string" && asset.fileName.trim()
                  ? asset.fileName.trim()
                  : `perfil-${Date.now()}.jpg`;
              const perfilSincronizado = await enviarFotoPerfilNoBackend(session.accessToken, {
                uri: asset.uri,
                nome: nomeArquivo,
                mimeType: typeof asset.mimeType === "string" && asset.mimeType.trim() ? asset.mimeType : "image/jpeg",
              });
              aplicarPerfilSincronizadoNoEstado(perfilSincronizado);
              notificarConfiguracaoConcluida("Foto atualizada e sincronizada com a conta.");
            } catch (error) {
              notificarConfiguracaoConcluida(
                `Foto aplicada localmente. Falha ao sincronizar no backend: ${error instanceof Error ? error.message : "indisponível agora."}`,
              );
            }
            break;
          }
          notificarConfiguracaoConcluida("Foto aplicada localmente ao perfil do inspetor.");
        } catch (error) {
          setSettingsSheetLoading(false);
          setSettingsSheetNotice(
            error instanceof Error ? error.message : "Não foi possível atualizar a foto agora.",
          );
          return;
        }
        break;
      default: {
        const delegatedResult = await handleSettingsSheetConfirmDelegated({
          billing: {
            current: cartaoAtual,
            onChange: setCartaoAtual,
          },
          email: {
            draft: novoEmailDraft,
            emailAtualConta,
            emailLogin: email,
            onAplicarPerfilSincronizado: aplicarPerfilSincronizadoNoEstado,
            onAtualizarPerfilContaNoBackend: atualizarPerfilContaNoBackend,
            onSetEmailAtualConta: setEmailAtualConta,
            perfilNome,
            session,
          },
          exports: {
            onCompartilharTextoExportado: compartilharTextoExportado,
          },
          kind: settingsSheet.kind,
          password: {
            confirmarSenhaDraft,
            novaSenhaDraft,
            onAtualizarSenhaContaNoBackend: atualizarSenhaContaNoBackend,
            onSetConfirmarSenhaDraft: setConfirmarSenhaDraft,
            onSetNovaSenhaDraft: setNovaSenhaDraft,
            onSetSenhaAtualDraft: setSenhaAtualDraft,
            senhaAtualDraft,
            session,
          },
          plan: {
            current: planoAtual,
            onChange: setPlanoAtual,
          },
          support: {
            bugAttachmentDraft,
            bugDescriptionDraft,
            bugEmailDraft,
            emailAtualConta,
            emailLogin: email,
            feedbackDraft,
            onEnviarRelatoSuporteNoBackend: enviarRelatoSuporteNoBackend,
            onSetBugAttachmentDraft: setBugAttachmentDraft,
            onSetBugDescriptionDraft: setBugDescriptionDraft,
            onSetBugEmailDraft: setBugEmailDraft,
            onSetFeedbackDraft: setFeedbackDraft,
            onSetFilaSuporteLocal: setFilaSuporteLocal,
            session,
            statusApi,
          },
          ui: {
            onNotificarConfiguracaoConcluida: notificarConfiguracaoConcluida,
            onRegistrarEventoSegurancaLocal: registrarEventoSegurancaLocal,
            onSetSettingsSheetLoading: setSettingsSheetLoading,
            onSetSettingsSheetNotice: setSettingsSheetNotice,
          },
          updates: {
            onPingApi: pingApi,
            onSetStatusApi: setStatusApi,
            onSetStatusAtualizacaoApp: setStatusAtualizacaoApp,
            onSetUltimaVerificacaoAtualizacao: setUltimaVerificacaoAtualizacao,
          },
        });
        if (delegatedResult === "return") {
          return;
        }
        break;
      }
    }

    setSettingsSheetLoading(false);
  }

  function executarLimpezaHistoricoLocal() {
    setConversa(criarConversaNova());
    setMensagensMesa([]);
    setMensagem("");
    setMensagemMesa("");
    setAnexoRascunho(null);
    setAnexoMesaRascunho(null);
    setPreviewAnexoImagem(null);
    setBuscaHistorico("");
    setCacheLeitura((estadoAtual) => limparCachePorPrivacidade(estadoAtual));
  }

  function executarLimpezaConversasLocais() {
    setLaudosDisponiveis([]);
    setConversa(criarConversaNova());
    setMensagensMesa([]);
    setMensagem("");
    setMensagemMesa("");
    setAnexoRascunho(null);
    setAnexoMesaRascunho(null);
    setPreviewAnexoImagem(null);
    setBuscaHistorico("");
    setNotificacoes([]);
    setCacheLeitura((estadoAtual) => limparCachePorPrivacidade(estadoAtual));
  }

  function handleConfirmarAcaoCritica() {
    handleConfirmSheetAction({
      confirmSheet,
      confirmTextDraft,
      onClearConversations: executarLimpezaConversasLocais,
      onClearHistory: executarLimpezaHistoricoLocal,
      onCloseConfirmacao: fecharConfirmacaoConfiguracao,
      onDeleteAccount: () => {
        void executarExclusaoContaLocal();
      },
      onRegistrarEventoSegurancaLocal: registrarEventoSegurancaLocal,
    });
  }

  function handleUploadFotoPerfil() {
    abrirSheetConfiguracao({
      kind: "photo",
      title: "Foto de perfil",
      subtitle: "Atualize a imagem usada na conta e no chat do inspetor.",
      actionLabel: "Escolher foto",
    });
  }

  function handleAlterarEmail() {
    setNovoEmailDraft(emailAtualConta || email);
    abrirSheetConfiguracao({
      kind: "email",
      title: "Alterar email",
      subtitle: "Atualize o email principal e envie uma confirmação para validar o acesso.",
      actionLabel: "Solicitar confirmação",
    });
  }

  function handleAlterarSenha() {
    setSenhaAtualDraft("");
    setNovaSenhaDraft("");
    setConfirmarSenhaDraft("");
    abrirSheetConfiguracao({
      kind: "password",
      title: "Alterar senha",
      subtitle: "Confirme sua senha atual e defina uma nova credencial para o aplicativo.",
      actionLabel: "Salvar nova senha",
    });
  }

  function handleGerenciarPlano() {
    abrirSheetConfiguracao({
      kind: "plan",
      title: "Plano e assinatura",
      subtitle: "Revise benefícios do plano atual e prepare a próxima mudança de assinatura do inspetor.",
      actionLabel: "Trocar plano",
    });
  }

  function handleHistoricoPagamentos() {
    abrirSheetConfiguracao({
      kind: "payments",
      title: "Histórico de pagamentos",
      subtitle: "Resumo financeiro da assinatura do inspetor e das últimas cobranças.",
    });
  }

  function handleGerenciarPagamento() {
    abrirSheetConfiguracao({
      kind: "billing",
      title: "Gerenciar pagamento",
      subtitle: "Atualize o cartão cadastrado e deixe o método de cobrança pronto para a próxima renovação.",
      actionLabel: "Atualizar cartão",
    });
  }

  function handleAbrirModeloIa() {
    abrirSheetConfiguracao({
      kind: "aiModel",
      title: "Modelo de IA",
      subtitle: "Escolha o perfil padrão para equilibrar velocidade, custo e profundidade das respostas.",
    });
  }

  function handleSelecionarModeloIa(value: (typeof AI_MODEL_OPTIONS)[number]) {
    if (!ehOpcaoValida(value, AI_MODEL_OPTIONS)) {
      return;
    }
    setModeloIa(value);
    fecharSheetConfiguracao();
  }

  async function handleExportarDados(formato: "JSON" | "PDF" | "TXT") {
    await runExportDataFlow({
      formato,
      reautenticacaoExpiraEm,
      reautenticacaoAindaValida,
      abrirFluxoReautenticacao,
      registrarEventoSegurancaLocal,
      abrirSheetConfiguracao,
      perfilNome,
      perfilExibicao,
      emailAtualConta,
      email,
      planoAtual,
      modeloIa,
      estiloResposta,
      idiomaResposta,
      temaApp,
      tamanhoFonte,
      densidadeInterface,
      corDestaque,
      memoriaIa,
      aprendizadoIa,
      economiaDados,
      usoBateria,
      notificaPush,
      notificaRespostas,
      emailsAtivos,
      vibracaoAtiva,
      mostrarConteudoNotificacao,
      mostrarSomenteNovaMensagem,
      salvarHistoricoConversas,
      compartilharMelhoriaIa,
      retencaoDados,
      ocultarConteudoBloqueado,
      integracoesExternas,
      laudosDisponiveis,
      notificacoes,
      eventosSeguranca,
      serializarPayloadExportacao,
      compartilharTextoExportado,
    });
  }

  function handleApagarHistoricoConfiguracoes() {
    executarComReautenticacao("Confirme sua identidade para apagar o histórico salvo neste dispositivo.", () => {
      abrirConfirmacaoConfiguracao({
        kind: "clearHistory",
        title: "Apagar histórico",
        description: "Remove o histórico salvo localmente neste app. Você poderá sincronizar novamente depois.",
        confirmLabel: "Apagar histórico",
      });
    });
  }

  function handleLimparTodasConversasConfig() {
    executarComReautenticacao("Confirme sua identidade para excluir todas as conversas locais do inspetor.", () => {
      abrirConfirmacaoConfiguracao({
        kind: "clearConversations",
        title: "Limpar conversas",
        description: "Limpa a lista local de conversas do app. O backend poderá sincronizar tudo de novo depois.",
        confirmLabel: "Limpar conversas",
      });
    });
  }

  function handleIntegracoesExternas() {
    abrirSheetConfiguracao({
      kind: "integrations",
      title: "Integrações",
      subtitle: "Conecte serviços externos ao fluxo do inspetor sem sair do app.",
    });
  }

  function handleAlternarIntegracaoExterna(integration: ExternalIntegration) {
    const conectando = !integration.connected;
    const agora = conectando ? new Date().toISOString() : "";
    setIntegracoesExternas((estadoAtual) =>
      estadoAtual.map((item) =>
        item.id === integration.id
          ? {
              ...item,
              connected: conectando,
              lastSyncAt: agora,
            }
          : item,
      ),
    );
    registrarEventoSegurancaLocal({
      title: conectando ? `${integration.label} conectada` : `${integration.label} desconectada`,
      meta: conectando
        ? "Integração habilitada nas configurações avançadas"
        : "Integração removida das configurações avançadas",
      status: "Agora",
      type: "provider",
    });
    setSettingsSheetNotice(
      conectando
        ? `${integration.label} conectada com sucesso.`
        : `${integration.label} desconectada deste dispositivo.`,
    );
  }

  async function handleSincronizarIntegracaoExterna(integration: ExternalIntegration) {
    if (!integration.connected) {
      setSettingsSheetNotice(`Conecte ${integration.label} antes de sincronizar.`);
      return;
    }

    if (integracaoSincronizandoId) {
      return;
    }

    setIntegracaoSincronizandoId(integration.id);
    try {
      await new Promise((resolve) => setTimeout(resolve, 420));
      const agora = new Date().toISOString();
      setIntegracoesExternas((estadoAtual) =>
        estadoAtual.map((item) =>
          item.id === integration.id
            ? {
                ...item,
                lastSyncAt: agora,
              }
            : item,
        ),
      );
      registrarEventoSegurancaLocal({
        title: `${integration.label} sincronizada`,
        meta: `Sincronização local concluída em ${formatarHorarioAtividade(agora)}`,
        status: "Agora",
        type: "data",
      });
      setSettingsSheetNotice(`${integration.label} sincronizada com sucesso.`);
    } finally {
      setIntegracaoSincronizandoId("");
    }
  }

  async function handleSelecionarScreenshotBug() {
    try {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted && permissao.accessPrivileges !== "limited") {
        setSettingsSheetNotice("Permita acesso às imagens para anexar o screenshot do bug.");
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        setSettingsSheetNotice("Seleção de screenshot cancelada.");
        return;
      }

      const screenshot = montarAnexoImagem(
        resultado.assets[0],
        "Screenshot anexada ao relato de bug para facilitar a reprodução.",
      );
      setBugAttachmentDraft(screenshot);
      setSettingsSheetNotice(`Screenshot "${screenshot.label}" anexada ao relato.`);
    } catch (error) {
      setSettingsSheetNotice(error instanceof Error ? error.message : "Não foi possível anexar o screenshot agora.");
    }
  }

  function handleRemoverScreenshotBug() {
    setBugAttachmentDraft(null);
    setSettingsSheetNotice("Screenshot removida do relato.");
  }

  function handleDetalhesSegurancaArquivos(topico: "validacao" | "urls" | "bloqueios") {
    if (topico === "validacao") {
      Alert.alert(
        "Validação de upload",
        "O app valida tipo e tamanho no cliente, e o backend valida novamente antes de aceitar o arquivo.",
      );
      return;
    }
    if (topico === "urls") {
      Alert.alert(
        "URLs protegidas",
        "Os anexos são servidos com autorização de sessão. Sem token válido, o arquivo não é aberto no app.",
      );
      return;
    }
    Alert.alert(
      "Falhas e bloqueios",
      "Quando o upload falha, o app mostra feedback e permite retomar pela fila offline sem perder contexto.",
    );
  }

  function handlePluginsIa() {
    abrirSheetConfiguracao({
      kind: "plugins",
      title: "Plugins da IA",
      subtitle: "Ative ferramentas extras para tornar a assistência do inspetor mais operacional.",
    });
  }

  function handlePermissoes() {
    handleAbrirPaginaConfiguracoes("seguranca", "permissoes");
  }

  function handlePoliticaPrivacidade() {
    abrirSheetConfiguracao({
      kind: "privacy",
      title: "Política de privacidade",
      subtitle: "Veja como a Tariel.ia trata dados, histórico e retenção das conversas.",
    });
  }

  function handleVerificarAtualizacoes() {
    abrirSheetConfiguracao({
      kind: "updates",
      title: "Verificar atualizações",
      subtitle: "Consulte a versão atual, o canal do app e o status de disponibilidade de novas builds.",
      actionLabel: "Verificar agora",
    });
  }

  function handleCentralAjuda() {
    setBuscaAjuda("");
    setArtigoAjudaExpandidoId(HELP_CENTER_ARTICLES[0]?.id ?? "");
    abrirSheetConfiguracao({
      kind: "help",
      title: "Central de ajuda",
      subtitle: "Acesse artigos, respostas rápidas e atalhos para suporte do inspetor.",
    });
  }

  function handleReportarProblema() {
    setBugDescriptionDraft("");
    setBugEmailDraft(emailAtualConta || email);
    setBugAttachmentDraft(null);
    abrirSheetConfiguracao({
      kind: "bug",
      title: "Reportar problema",
      subtitle: "Descreva o bug encontrado e envie o contexto para a equipe da Tariel.ia.",
      actionLabel: "Enviar relato",
    });
  }

  function handleEnviarFeedback() {
    setFeedbackDraft("");
    abrirSheetConfiguracao({
      kind: "feedback",
      title: "Enviar feedback",
      subtitle: "Compartilhe ideias, melhorias e sugestões para a próxima evolução do app.",
      actionLabel: "Enviar feedback",
    });
  }

  function handleAlternarArtigoAjuda(articleId: string) {
    setArtigoAjudaExpandidoId((estadoAtual) => (estadoAtual === articleId ? "" : articleId));
  }

  async function handleExportarDiagnosticoApp() {
    const eventosObservabilidade = await listarEventosObservabilidade(80);
    const resumoObservabilidade = resumirEventosObservabilidade(eventosObservabilidade);
    const payload = [
      "Tariel Inspetor - Diagnóstico local",
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      `Build: ${APP_VERSION_LABEL} (${APP_BUILD_CHANNEL})`,
      `API: ${statusApi === "online" ? "online" : "offline"}`,
      `Conta: ${perfilNome || perfilExibicao || "Inspetor"}`,
      `Email: ${emailAtualConta || email || "Sem email"}`,
      `Sessão atual: ${sessaoAtual?.title || "Dispositivo atual"}`,
      `Fila offline: ${filaOffline.length} item(ns)`,
      `Fila de suporte: ${filaSuporteLocal.length} item(ns)`,
      `Fila de suporte com anexo: ${filaSuporteLocal.filter((item) => Boolean(item.attachmentUri)).length} item(ns)`,
      `Integrações conectadas: ${integracoesExternas.filter((item) => item.connected).length}/${integracoesExternas.length}`,
      `Observabilidade: ${resumoObservabilidade.total} evento(s) / ${resumoObservabilidade.failures} falha(s)`,
      `Observabilidade (último evento): ${resumoObservabilidade.latestAt ? formatarHorarioAtividade(resumoObservabilidade.latestAt) : "nenhum"}`,
      `Observabilidade (latência média): ${resumoObservabilidade.averageDurationMs} ms`,
      `Observabilidade (por tipo): api=${resumoObservabilidade.byKind.api}, fila=${resumoObservabilidade.byKind.offline_queue}, atividade=${resumoObservabilidade.byKind.activity_monitor}, push=${resumoObservabilidade.byKind.push}`,
      `Observabilidade (falhas por tipo): api=${resumoObservabilidade.failuresByKind.api}, fila=${resumoObservabilidade.failuresByKind.offline_queue}, atividade=${resumoObservabilidade.failuresByKind.activity_monitor}, push=${resumoObservabilidade.failuresByKind.push}`,
      `Última verificação de atualização: ${ultimaVerificacaoAtualizacao ? formatarHorarioAtividade(ultimaVerificacaoAtualizacao) : "nunca"}`,
      `Status da atualização: ${statusAtualizacaoApp}`,
      `Permissões: ${[microfonePermitido ? "microfone" : "", cameraPermitida ? "câmera" : "", arquivosPermitidos ? "arquivos" : "", notificacoesPermitidas ? "notificações" : "", biometriaPermitida ? "biometria" : ""].filter(Boolean).join(", ") || "nenhuma ativa"}`,
      "",
      "Eventos recentes de segurança:",
      ...eventosSeguranca.slice(0, 5).map((item) => `- ${item.title} • ${item.status} • ${item.meta}`),
    ].join("\n");

    const exportado = await compartilharTextoExportado({
      extension: "txt",
      content: payload,
      prefixo: "tariel-inspetor-diagnostico",
    });
    if (exportado) {
      registrarEventoSegurancaLocal({
        title: "Diagnóstico exportado",
        meta: "Pacote textual compartilhado pelo fluxo de suporte",
        status: "Agora",
        type: "data",
      });
      return;
    }
    setSettingsSheetNotice("Não foi possível compartilhar o diagnóstico agora.");
  }

  function handleLimparFilaSuporteLocal() {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Limpar fila local de suporte",
      description: "Remove os relatos de bug e feedback guardados apenas neste dispositivo. O histórico de segurança permanece intacto.",
      confirmLabel: "Limpar fila",
      onConfirm: () => {
        setFilaSuporteLocal([]);
        registrarEventoSegurancaLocal({
          title: "Fila local de suporte limpa",
          meta: "Relatos locais removidos pelo usuário",
          status: "Agora",
          type: "data",
        });
      },
    });
  }

  function handleTermosUso() {
    abrirSheetConfiguracao({
      kind: "terms",
      title: "Termos de uso",
      subtitle: "Resumo das condições de uso do app do inspetor e das responsabilidades do usuário.",
      actionLabel: "Exportar TXT",
    });
  }

  function handleLicencas() {
    abrirSheetConfiguracao({
      kind: "licenses",
      title: "Licenças",
      subtitle: "Bibliotecas, dependências e componentes utilizados nesta build do aplicativo.",
      actionLabel: "Exportar TXT",
    });
  }

  function handleExcluirConta() {
    executarComReautenticacao("Confirme sua identidade para excluir a conta e invalidar todas as sessões do app.", () => {
      abrirConfirmacaoConfiguracao({
        kind: "deleteAccount",
        title: "Excluir conta",
        description: "Essa ação é permanente, invalida sessões e remove os dados conforme a política do sistema. Digite EXCLUIR para continuar.",
        confirmLabel: "Excluir permanentemente",
        confirmPhrase: "EXCLUIR",
      });
    });
  }

  function handleToggleProviderConnection(provider: ConnectedProvider) {
    const conectados = provedoresConectados.filter((item) => item.connected).length;
    if (provider.connected) {
      if (conectados <= 1) {
        abrirConfirmacaoConfiguracao({
          kind: "provider",
          title: "Último método de acesso",
          description: "Cadastre outro provedor ou mantenha um método adicional válido antes de desconectar este acesso.",
          confirmLabel: "Entendi",
        });
        return;
      }

      executarComReautenticacao(`Confirme sua identidade para desconectar ${provider.label} desta conta.`, () => {
        abrirConfirmacaoConfiguracao({
          kind: "provider",
          title: `Desconectar ${provider.label}`,
          description: provider.requiresReauth
            ? `Confirme a desconexão do provedor ${provider.label}. Para ações sensíveis, a reautenticação será exigida.`
            : `Confirme a desconexão do provedor ${provider.label}.`,
          confirmLabel: "Desconectar",
          onConfirm: () => {
            setProvedoresConectados((estadoAtual) =>
              estadoAtual.map((item) =>
                item.id === provider.id ? { ...item, connected: false, email: "" } : item,
              ),
            );
            registrarEventoSegurancaLocal({
              title: `${provider.label} desconectado`,
              meta: "Evento de segurança registrado na conta do inspetor",
              status: "Agora",
              type: "provider",
              critical: true,
            });
          },
        });
      });
      return;
    }

    executarComReautenticacao(`Confirme sua identidade para vincular ${provider.label} à conta do inspetor.`, () => {
      setProvedoresConectados((estadoAtual) =>
        estadoAtual.map((item) =>
          item.id === provider.id ? { ...item, connected: true, email: emailAtualConta || email } : item,
        ),
      );
      registrarEventoSegurancaLocal({
        title: `${provider.label} conectado`,
        meta: emailAtualConta || email || "Conta corporativa vinculada",
        status: "Agora",
        type: "provider",
      });
    });
  }

  function handleEncerrarSessao(item: SessionDevice) {
    abrirConfirmacaoConfiguracao({
      kind: "session",
      title: "Encerrar sessão",
      description: `Deseja encerrar a sessão em ${item.title}?`,
      confirmLabel: "Encerrar",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) => estadoAtual.filter((sessao) => sessao.id !== item.id));
        registrarEventoSegurancaLocal({
          title: "Sessão encerrada",
          meta: `${item.title} • ${item.location}`,
          status: "Agora",
          type: "session",
        });
      },
    });
  }

  function handleRevisarSessao(item: SessionDevice) {
    const vaiMarcarComoSuspeita = !item.suspicious;
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: vaiMarcarComoSuspeita ? "Sinalizar atividade incomum" : "Marcar sessão como segura",
      description: vaiMarcarComoSuspeita
        ? `Deseja sinalizar ${item.title} como atividade incomum para revisão posterior?`
        : `Deseja remover o alerta de risco da sessão em ${item.title}?`,
      confirmLabel: vaiMarcarComoSuspeita ? "Sinalizar" : "Marcar segura",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) =>
          estadoAtual.map((sessao) =>
            sessao.id === item.id ? { ...sessao, suspicious: vaiMarcarComoSuspeita } : sessao,
          ),
        );
        registrarEventoSegurancaLocal({
          title: vaiMarcarComoSuspeita ? "Sessão sinalizada como incomum" : "Sessão marcada como segura",
          meta: `${item.title} • ${item.location}`,
          status: "Agora",
          type: "session",
          critical: vaiMarcarComoSuspeita,
        });
      },
    });
  }

  function handleEncerrarOutrasSessoes() {
    abrirConfirmacaoConfiguracao({
      kind: "sessionOthers",
      title: "Encerrar todas as outras",
      description: "Deseja encerrar todas as outras sessões ativas do inspetor?",
      confirmLabel: "Encerrar",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) => estadoAtual.filter((sessao) => sessao.current));
        registrarEventoSegurancaLocal({
          title: "Outras sessões encerradas",
          meta: "Sessões antigas invalidadas no dispositivo atual",
          status: "Agora",
          type: "session",
          critical: true,
        });
      },
    });
  }

  function handleEncerrarSessaoAtual() {
    abrirConfirmacaoConfiguracao({
      kind: "sessionCurrent",
      title: "Encerrar esta sessão",
      description: "Deseja sair deste dispositivo agora? O token atual será invalidado e você precisará entrar novamente.",
      confirmLabel: "Encerrar",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Sessão atual encerrada",
          meta: "Logout acionado a partir do dispositivo em uso",
          status: "Agora",
          type: "session",
          critical: true,
        });
        fecharConfiguracoes();
        void handleLogout();
      },
    });
  }

  function handleEncerrarSessoesSuspeitas() {
    const sessoesSuspeitas = sessoesAtivas.filter((item) => item.suspicious);
    if (!sessoesSuspeitas.length) {
      abrirConfirmacaoConfiguracao({
        kind: "security",
        title: "Nenhuma sessão suspeita",
        description: "No momento não existe nenhuma sessão marcada como suspeita para encerrar.",
        confirmLabel: "Entendi",
      });
      return;
    }

    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Encerrar sessões suspeitas",
      description: `Vamos encerrar ${sessoesSuspeitas.length} sessão(ões) marcadas como suspeitas e manter somente as confiáveis.`,
      confirmLabel: "Encerrar suspeitas",
      onConfirm: () => {
        setSessoesAtivas((estadoAtual) => estadoAtual.filter((sessao) => !sessao.suspicious));
        registrarEventoSegurancaLocal({
          title: "Sessões suspeitas encerradas",
          meta: `${sessoesSuspeitas.length} sessão(ões) removidas após revisão`,
          status: "Agora",
          type: "session",
          critical: true,
        });
      },
    });
  }

  function handleConectarProximoProvedorDisponivel() {
    const proximoProvider = provedoresConectados.find((item) => !item.connected) || null;
    if (!proximoProvider) {
      abrirConfirmacaoConfiguracao({
        kind: "provider",
        title: "Todos os provedores já estão vinculados",
        description: "Google, Apple e Microsoft já estão conectados nesta conta do inspetor.",
        confirmLabel: "Entendi",
      });
      return;
    }

    handleToggleProviderConnection(proximoProvider);
  }

  async function handleCompartilharCodigosRecuperacao() {
    if (!codigosRecuperacao.length) {
      setSettingsSheetNotice("Gere os códigos primeiro para compartilhar ou salvar com segurança.");
      return;
    }

    if (!reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
      abrirFluxoReautenticacao(
        "Confirme sua identidade para exportar os códigos de recuperação da verificação em duas etapas.",
        () => {
          void handleCompartilharCodigosRecuperacao();
        },
      );
      return;
    }

    const conteudo = [
      "Tariel Inspetor • Códigos de recuperação",
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      "",
      ...codigosRecuperacao,
      "",
      "Guarde estes códigos em local seguro. Cada código deve ser usado apenas uma vez.",
    ].join("\n");

    const compartilhado = await compartilharTextoExportado({
      extension: "txt",
      content: conteudo,
      prefixo: "tariel-recovery-codes",
    });

    if (compartilhado) {
      registrarEventoSegurancaLocal({
        title: "Códigos de recuperação exportados",
        meta: "Exportação local concluída com reautenticação válida",
        status: "Agora",
        type: "2fa",
        critical: true,
      });
      setSettingsSheetNotice("Códigos compartilhados. Salve-os em um local seguro.");
      return;
    }

    setSettingsSheetNotice("Não foi possível exportar os códigos agora. Tente novamente em alguns segundos.");
  }

  function handleReautenticacaoSensivel() {
    abrirFluxoReautenticacao(
      "Confirme a identidade do inspetor para liberar exportação, exclusão de dados, 2FA e mudanças sensíveis na conta.",
    );
  }

  function handleMudarMetodo2FA(value: (typeof TWO_FACTOR_METHOD_OPTIONS)[number]) {
    if (value === twoFactorMethod) {
      return;
    }
    setTwoFactorMethod(value);
    registrarEventoSegurancaLocal({
      title: "Método preferido de 2FA atualizado",
      meta: `Novo método preferido: ${value}`,
      status: "Agora",
      type: "2fa",
      critical: twoFactorEnabled,
    });
  }

  function handleToggle2FA() {
    const proximoEstado = !twoFactorEnabled;
    executarComReautenticacao(
      proximoEstado
        ? "Confirme sua identidade para ativar a verificação em duas etapas."
        : "Confirme sua identidade para desativar a verificação em duas etapas.",
      () => {
        abrirConfirmacaoConfiguracao({
          kind: "security",
          title: proximoEstado ? "Ativar verificação em duas etapas" : "Desativar verificação em duas etapas",
          description: proximoEstado
            ? "A ativação será registrada no histórico de segurança e passa a proteger ações críticas."
            : "A desativação da 2FA exige confirmação forte e ficará registrada no histórico de segurança.",
          confirmLabel: proximoEstado ? "Ativar" : "Desativar",
          onConfirm: () => {
            setTwoFactorEnabled(proximoEstado);
            registrarEventoSegurancaLocal({
              title: proximoEstado ? "2FA ativada" : "2FA desativada",
              meta: `Método preferido: ${twoFactorMethod}`,
              status: "Agora",
              type: "2fa",
              critical: !proximoEstado,
            });
          },
        });
      },
    );
  }

  function handleGerarCodigosRecuperacao() {
    executarComReautenticacao("Confirme sua identidade para gerar novos códigos de recuperação.", () => {
      const novosCodigos = Array.from({ length: 6 }, (_, index) => `TG-${index + 1}${Math.random().toString(36).slice(2, 7).toUpperCase()}`);
      setCodigosRecuperacao(novosCodigos);
      registrarEventoSegurancaLocal({
        title: "Códigos de recuperação gerados",
        meta: "Exibidos uma única vez ao usuário",
        status: "Agora",
        type: "2fa",
      });
      abrirSheetConfiguracao({
        kind: "reauth",
        title: "Códigos de recuperação",
        subtitle: "Os novos códigos já foram gerados e aparecem na seção de 2FA. Salve-os em local seguro antes de sair.",
      });
    });
  }

  function handleConfirmarCodigo2FA() {
    if (codigo2FA.trim().length < 6) {
      Alert.alert("Código inválido", "Digite um código válido para concluir a configuração da verificação em duas etapas.");
      return;
    }

    registrarEventoSegurancaLocal({
      title: "Código 2FA confirmado",
      meta: `Método validado: ${twoFactorMethod}`,
      status: "Agora",
      type: "2fa",
    });
    Alert.alert("Código confirmado", "A verificação em duas etapas foi confirmada no app.");
    setCodigo2FA("");
  }

  function handleGerenciarPermissao(nome: string, status: string) {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: `Gerenciar ${nome}`,
      description: `${nome} está com status "${status}". Vamos abrir as configurações do sistema para ajustar essa permissão com segurança.`,
      confirmLabel: "Abrir ajustes",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: `Permissão revisada: ${nome}`,
          meta: `Status atual ${status}. Ajustes do sistema foram abertos pelo usuário.`,
          status: "Agora",
          type: "session",
        });
        void Linking.openSettings();
      },
    });
  }

  function handleAbrirAjustesDoSistema(contexto: string) {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Abrir ajustes do sistema",
      description: `Vamos abrir as configurações do Android para revisar ${contexto}.`,
      confirmLabel: "Abrir ajustes",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Ajustes do sistema abertos",
          meta: `Fluxo acionado a partir de ${contexto}`,
          status: "Agora",
          type: "session",
        });
        void Linking.openSettings();
      },
    });
  }

  function handleToggleBiometriaNoDispositivo(value: boolean) {
    if (!value) {
      setDeviceBiometricsEnabled(false);
      registrarEventoSegurancaLocal({
        title: "Biometria de desbloqueio desativada",
        meta: "O desbloqueio local por biometria foi desativado neste dispositivo.",
        status: "Agora",
        type: "session",
      });
      return;
    }

    if (!biometriaPermitida) {
      setDeviceBiometricsEnabled(false);
      Alert.alert(
        "Permissão necessária",
        "Libere biometria nas permissões do Android para usar desbloqueio biométrico no app.",
        [
          { text: "Agora não", style: "cancel" },
          {
            text: "Abrir ajustes",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ],
      );
      return;
    }

    if (!requireAuthOnOpen) {
      setRequireAuthOnOpen(true);
    }
    setDeviceBiometricsEnabled(true);
    registrarEventoSegurancaLocal({
      title: "Biometria de desbloqueio ativada",
      meta: "O app poderá usar biometria ao abrir e em desbloqueios locais.",
      status: "Agora",
      type: "session",
    });
  }

  function handleToggleBackupAutomatico(value: boolean) {
    setBackupAutomatico(value);
    if (!value) {
      void salvarCacheLeituraLocal(CACHE_LEITURA_VAZIO);
      registrarEventoSegurancaLocal({
        title: "Backup automático desativado",
        meta: "O cache de leitura local foi limpo e novos backups automáticos foram pausados.",
        status: "Agora",
        type: "data",
      });
      return;
    }
    registrarEventoSegurancaLocal({
      title: "Backup automático ativado",
      meta: "O app voltará a persistir cache local de leitura automaticamente.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleSincronizacaoDispositivos(value: boolean) {
    setSincronizacaoDispositivos(value);
    if (!value) {
      registrarEventoSegurancaLocal({
        title: "Sincronização entre dispositivos desativada",
        meta: "Monitoramento em segundo plano e sincronização automática da fila offline foram pausados.",
        status: "Agora",
        type: "session",
      });
      return;
    }
    registrarEventoSegurancaLocal({
      title: "Sincronização entre dispositivos ativada",
      meta: "Monitoramento automático do app e sincronização de pendências foram reativados.",
      status: "Agora",
      type: "session",
    });
    if (session && statusApi === "online" && filaOffline.some((item) => pendenciaFilaProntaParaReenvio(item))) {
      void sincronizarFilaOffline(session.accessToken, true);
    }
  }

  function handleToggleUploadArquivos(value: boolean) {
    if (!value) {
      setUploadArquivosAtivo(false);
      setAnexoRascunho(null);
      setAnexoMesaRascunho(null);
      registrarEventoSegurancaLocal({
        title: "Upload de arquivos desativado",
        meta: "Anexos foram bloqueados no composer e rascunhos de anexo foram removidos.",
        status: "Agora",
        type: "data",
      });
      return;
    }

    if (!arquivosPermitidos) {
      setUploadArquivosAtivo(false);
      Alert.alert(
        "Permissão necessária",
        "Libere o acesso a arquivos no Android para anexar documentos e imagens no app.",
        [
          { text: "Agora não", style: "cancel" },
          {
            text: "Abrir ajustes",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ],
      );
      return;
    }

    setUploadArquivosAtivo(true);
    registrarEventoSegurancaLocal({
      title: "Upload de arquivos ativado",
      meta: "Anexos de imagem e documento liberados no fluxo de conversa.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleEntradaPorVoz(value: boolean) {
    if (!value) {
      setEntradaPorVoz(false);
      registrarEventoSegurancaLocal({
        title: "Entrada por voz desativada",
        meta: "Comandos por voz foram desativados neste dispositivo.",
        status: "Agora",
        type: "data",
      });
      return;
    }

    if (!microfonePermitido) {
      setEntradaPorVoz(false);
      Alert.alert(
        "Permissão necessária",
        "Ative a permissão de microfone no Android para usar entrada por voz no app.",
        [
          { text: "Agora não", style: "cancel" },
          {
            text: "Abrir ajustes",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ],
      );
      return;
    }

    setEntradaPorVoz(true);
    registrarEventoSegurancaLocal({
      title: "Entrada por voz ativada",
      meta: "O app está autorizado a receber comandos por voz quando disponíveis no dispositivo.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleRespostaPorVoz(value: boolean) {
    setRespostaPorVoz(value);
    registrarEventoSegurancaLocal({
      title: "Resposta por voz atualizada",
      meta: value
        ? "O app poderá usar síntese de voz quando o recurso estiver disponível no dispositivo."
        : "Saída por voz desativada neste dispositivo.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleNotificaPush(value: boolean) {
    if (!value) {
      setNotificaPush(false);
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_toggle",
        ok: true,
        detail: "disabled",
      });
      return;
    }

    if (notificacoesPermitidas) {
      setNotificaPush(true);
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_toggle",
        ok: true,
        detail: "enabled",
      });
      return;
    }

    setNotificaPush(false);
    void registrarEventoObservabilidade({
      kind: "push",
      name: "push_toggle",
      ok: false,
      detail: "permission_denied",
    });
    Alert.alert(
      "Permissão necessária",
      "Ative as notificações do sistema para habilitar alertas push no app.",
      [
        { text: "Agora não", style: "cancel" },
        {
          text: "Abrir ajustes",
          onPress: () => {
            void Linking.openSettings();
          },
        },
      ],
    );
  }

  function handleToggleVibracao(value: boolean) {
    setVibracaoAtiva(value);
    if (value) {
      Vibration.vibrate(24);
    }
    registrarEventoSegurancaLocal({
      title: "Vibração do app atualizada",
      meta: value ? "Feedback tátil ativado nas ações do aplicativo." : "Feedback tátil desativado.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleMostrarConteudoNotificacao(value: boolean) {
    setMostrarConteudoNotificacao(value);
    if (value) {
      setMostrarSomenteNovaMensagem(false);
    }
    registrarEventoSegurancaLocal({
      title: "Prévia de notificação atualizada",
      meta: value
        ? "Conteúdo das mensagens pode aparecer quando o sistema permitir."
        : "Conteúdo textual das mensagens ficou oculto nas notificações.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleOcultarConteudoBloqueado(value: boolean) {
    setOcultarConteudoBloqueado(value);
    registrarEventoSegurancaLocal({
      title: "Privacidade na tela bloqueada atualizada",
      meta: value
        ? "Conteúdo sensível oculto na tela bloqueada."
        : "O app permite prévias fora da tela bloqueada, conforme o sistema.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleMostrarSomenteNovaMensagem(value: boolean) {
    setMostrarSomenteNovaMensagem(value);
    if (value) {
      setMostrarConteudoNotificacao(false);
      setOcultarConteudoBloqueado(true);
    }
    registrarEventoSegurancaLocal({
      title: "Modo privado de notificação atualizado",
      meta: value
        ? 'As notificações exibem apenas "Nova mensagem".'
        : "O app voltou a permitir outros níveis de prévia.",
      status: "Agora",
      type: "data",
    });
  }

  function handleRevisarPermissoesCriticas() {
    const faltando = [
      !cameraPermitida ? "câmera" : "",
      !arquivosPermitidos ? "arquivos" : "",
      !notificacoesPermitidas ? "notificações" : "",
    ].filter(Boolean);
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Revisar permissões críticas",
      description: faltando.length
        ? `Ainda faltam ${faltando.join(", ")} para o app operar melhor em campo. Vamos abrir os ajustes do Android.`
        : "As permissões críticas já estão liberadas. Você ainda pode revisar tudo nos ajustes do Android.",
      confirmLabel: "Abrir ajustes",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Revisão de permissões críticas",
          meta: faltando.length ? `Pendentes: ${faltando.join(", ")}` : "Todas as permissões críticas já estavam liberadas",
          status: "Agora",
          type: "session",
        });
        void Linking.openSettings();
      },
    });
  }

  function handleExportarAntesDeExcluirConta() {
    executarComReautenticacao("Confirme sua identidade para exportar os dados antes da exclusão permanente da conta.", () => {
      void handleExportarDados("JSON");
    });
  }

  function handleReportarAtividadeSuspeita() {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Reportar atividade suspeita",
      description: "Esse evento será marcado como crítico no histórico de segurança do inspetor e usado para revisão posterior.",
      confirmLabel: "Reportar",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Atividade suspeita reportada",
          meta: "O usuário sinalizou uma ocorrência no histórico de segurança",
          status: "Agora",
          type: "session",
          critical: true,
        });
      },
    });
  }

  function handleAbrirSeletorAnexo() {
    if (!uploadArquivosAtivo) {
      Alert.alert(
        "Uploads desativados",
        "O envio de arquivos está desligado nas preferências do app. Reative em Configurações > Recursos avançados.",
      );
      return;
    }
    if (!arquivosPermitidos) {
      Alert.alert(
        "Arquivos bloqueados",
        "O acesso a arquivos foi desativado neste dispositivo. Ajuste isso em Configurações > Permissões.",
      );
      return;
    }
    setAnexosAberto(true);
  }

  async function handleEscolherAnexo(opcao: "camera" | "galeria" | "documento") {
    setAnexosAberto(false);
    if (!uploadArquivosAtivo) {
      return;
    }
    if (opcao === "camera" && !cameraPermitida) {
      Alert.alert("Câmera indisponível", "Ative a câmera em Configurações > Permissões para anexar fotos.");
      return;
    }
    if (opcao !== "camera" && !arquivosPermitidos) {
      Alert.alert("Arquivos indisponíveis", "Ative o acesso a arquivos em Configurações > Permissões.");
      return;
    }
    if (opcao === "camera") {
      await handleCapturarImagem();
      return;
    }
    if (opcao === "galeria") {
      await handleSelecionarImagem();
      return;
    }
    await handleSelecionarDocumento();
  }

  function handleAbrirHistorico() {
    if (historicoAberto || historicoAbertoRef.current) {
      fecharHistorico({ limparBusca: true });
      return;
    }
    abrirHistorico();
  }

  function handleGerenciarConversasIndividuais() {
    fecharConfiguracoes();
    setTimeout(() => {
      abrirHistorico();
    }, 180);
  }

  function atualizarLaudosLocais(transform: (itens: MobileLaudoCard[]) => MobileLaudoCard[]) {
    setLaudosDisponiveis((estadoAtual) => {
      const proximosLaudos = transform(estadoAtual);
      setCacheLeitura((cacheAtual) => ({
        ...cacheAtual,
        laudos: transform(cacheAtual.laudos),
        updatedAt: new Date().toISOString(),
      }));
      return proximosLaudos;
    });
  }

  function handleAlternarFixadoHistorico(card: MobileLaudoCard) {
    const vaiFixar = !card.pinado;
    setLaudosFixadosIds((estadoAtual) =>
      vaiFixar ? Array.from(new Set([...estadoAtual, card.id])) : estadoAtual.filter((item) => item !== card.id),
    );
    atualizarLaudosLocais((itens) =>
      itens.map((item) => (item.id === card.id ? { ...item, pinado: vaiFixar } : item)),
    );
  }

  function handleExcluirConversaHistorico(card: MobileLaudoCard) {
    executarComReautenticacao(`Confirme sua identidade para remover ${card.titulo} do histórico deste app.`, () => {
      abrirConfirmacaoConfiguracao({
        kind: "security",
        title: "Remover do histórico",
        description: `A conversa "${card.titulo}" será removida localmente do histórico do inspetor neste dispositivo.`,
        confirmLabel: "Remover",
        onConfirm: () => {
          setHistoricoOcultoIds((estadoAtual) => Array.from(new Set([...estadoAtual, card.id])));
          setLaudosFixadosIds((estadoAtual) => estadoAtual.filter((item) => item !== card.id));
          atualizarLaudosLocais((itens) => itens.filter((item) => item.id !== card.id));
          setCacheLeitura((estadoAtual) => {
            const chave = chaveCacheLaudo(card.id);
            const { [chave]: _chatRemovido, ...restoConversas } = estadoAtual.conversasPorLaudo;
            const { [chave]: _mesaRemovida, ...restoMesa } = estadoAtual.mesaPorLaudo;
            return {
              ...estadoAtual,
              laudos: estadoAtual.laudos.filter((item) => item.id !== card.id),
              conversasPorLaudo: restoConversas,
              mesaPorLaudo: restoMesa,
              updatedAt: new Date().toISOString(),
            };
          });
          setNotificacoes((estadoAtual) => estadoAtual.filter((item) => item.laudoId !== card.id));
          if (conversa?.laudoId === card.id) {
            setConversa(criarConversaNova());
            setMensagensMesa([]);
            setMensagem("");
            setMensagemMesa("");
            setAnexoRascunho(null);
            setAnexoMesaRascunho(null);
            setErroMesa("");
            setErroConversa("");
            setLaudoMesaCarregado(null);
          }
        },
      });
    });
  }

  async function handleSelecionarHistorico(card: MobileLaudoCard | null) {
    fecharHistorico({ limparBusca: true });
    setAbaAtiva("chat");
    await handleSelecionarLaudo(card);
  }

  async function tentarAbrirUrlExterna(url: string): Promise<boolean> {
    const target = String(url || "").trim();
    if (!target) {
      return false;
    }
    try {
      const supported = await Linking.canOpenURL(target);
      if (!supported) {
        return false;
      }
      await Linking.openURL(target);
      return true;
    } catch {
      return false;
    }
  }

  function handleEsqueciSenha() {
    const url = obterUrlRecuperacaoSenhaMobile(email);
    void (async () => {
      const abriu = await tentarAbrirUrlExterna(url);
      if (!abriu) {
        Alert.alert(
          "Recuperação de senha",
          "Não foi possível abrir o fluxo agora. Tente novamente em instantes ou contate o administrador da sua empresa.",
        );
      }
    })();
  }

  function handleLoginSocial(provider: "Google" | "Microsoft") {
    const url = obterUrlLoginSocialMobile(provider);
    void (async () => {
      const abriu = await tentarAbrirUrlExterna(url);
      if (!abriu) {
        Alert.alert(
          `${provider} indisponível`,
          `Não foi possível abrir o login com ${provider} agora. Use email e senha enquanto o acesso externo é normalizado.`,
        );
      }
    })();
  }

  const historyEdgePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !historicoAbertoRef.current &&
        !configuracoesAbertaRef.current &&
        gestureState.x0 <= PANEL_EDGE_GESTURE_WIDTH &&
        gestureState.dx > 8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= PANEL_OPEN_SWIPE_THRESHOLD) {
          handleAbrirHistorico();
        }
      },
    }),
  ).current;

  const settingsEdgePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !historicoAbertoRef.current &&
        !configuracoesAbertaRef.current &&
        gestureState.x0 >= SCREEN_WIDTH - PANEL_EDGE_GESTURE_WIDTH &&
        gestureState.dx < -8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx <= -PANEL_OPEN_SWIPE_THRESHOLD) {
          handleAbrirConfiguracoes();
        }
      },
    }),
  ).current;

  const historyDrawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        historicoAbertoRef.current &&
        gestureState.dx < -8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx <= -PANEL_CLOSE_SWIPE_THRESHOLD) {
          fecharHistorico({ limparBusca: true });
        }
      },
    }),
  ).current;

  const settingsDrawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        configuracoesAbertaRef.current &&
        gestureState.dx > 8 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= PANEL_CLOSE_SWIPE_THRESHOLD) {
          fecharConfiguracoes();
        }
      },
    }),
  ).current;

  async function abrirLaudoPorId(accessToken: string, laudoId: number) {
    setErroConversa("");
    setErroMesa("");
    setMensagem("");
    setMensagemMesa("");
    setAnexoRascunho(null);
    setAnexoMesaRascunho(null);
    limparReferenciaMesaAtiva();
    setCarregandoConversa(true);

    try {
      const historico = await carregarMensagensLaudo(accessToken, laudoId);
      const proximaConversa = normalizarConversa(historico);
      setConversa(proximaConversa);
      setUsandoCacheOffline(false);
      setCacheLeitura((estadoAtual) => ({
        ...estadoAtual,
        conversaAtual: proximaConversa,
        conversasPorLaudo: {
          ...estadoAtual.conversasPorLaudo,
          [chaveCacheLaudo(laudoId)]: proximaConversa,
        },
        updatedAt: new Date().toISOString(),
      }));
      setMensagensMesa([]);
      setLaudoMesaCarregado(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível abrir o laudo selecionado.";
      const conversaCache = cacheLeitura.conversasPorLaudo[chaveCacheLaudo(laudoId)];
      const emModoOffline = statusApi === "offline" || erroSugereModoOffline(error);
      if (emModoOffline && conversaCache) {
        setConversa(conversaCache);
        setMensagensMesa(cacheLeitura.mesaPorLaudo[chaveCacheLaudo(laudoId)] || []);
        setLaudoMesaCarregado((cacheLeitura.mesaPorLaudo[chaveCacheLaudo(laudoId)] || []).length ? laudoId : null);
        setUsandoCacheOffline(true);
        return;
      }
      setErroConversa(message);
    } finally {
      setCarregandoConversa(false);
    }
  }

  async function handleAbrirNotificacao(item: MobileActivityNotification) {
    if (!session) {
      return;
    }

    setCentralAtividadeAberta(false);
    setNotificacoes((estadoAtual) =>
      estadoAtual.map((registro) =>
        registro.id === item.id && registro.unread ? { ...registro, unread: false } : registro,
      ),
    );

    if (!item.laudoId) {
      return;
    }

    await abrirLaudoPorId(session.accessToken, item.laudoId);
    setAbaAtiva(item.targetThread);

    if (item.targetThread === "mesa") {
      await carregarMesaAtual(session.accessToken, item.laudoId, true);
    }
  }

  async function monitorarAtividade(accessToken: string) {
    await runMonitorActivityFlow<MobileActivityNotification>({
      accessToken,
      monitorandoAtividade,
      conversaLaudoId: conversa?.laudoId ?? null,
      conversaLaudoTitulo: conversa?.laudoCard?.titulo || "",
      sessionUserId: session?.bootstrap.usuario.id ?? null,
      assinaturaStatusLaudo,
      assinaturaMensagemMesa,
      selecionarLaudosParaMonitoramentoMesa,
      criarNotificacaoStatusLaudo,
      criarNotificacaoMesa,
      atualizarResumoLaudoAtual: (payload) => {
        setConversa((estadoAtual) => atualizarResumoLaudoAtual(estadoAtual, payload as any));
      },
      registrarNotificacoes,
      erroSugereModoOffline,
      chaveCacheLaudo,
      statusSnapshotRef,
      mesaSnapshotRef,
      onSetMonitorandoAtividade: setMonitorandoAtividade,
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
    });
  }

  async function handleSelecionarLaudo(card: MobileLaudoCard | null) {
    if (!session) {
      return;
    }

    setErroConversa("");
    setErroMesa("");
    setMensagem("");
    setMensagemMesa("");
    setAnexoRascunho(null);
    setAnexoMesaRascunho(null);
    setAbaAtiva("chat");

    if (!card) {
      setConversa(criarConversaNova());
      setMensagensMesa([]);
      setLaudoMesaCarregado(null);
      return;
    }

    await abrirLaudoPorId(session.accessToken, card.id);
  }

  async function handleReabrir() {
    if (!session || !conversa?.laudoId) {
      return;
    }

    try {
      await reabrirLaudoMobile(session.accessToken, conversa.laudoId);
      const proximaConversa = await carregarConversaAtual(session.accessToken, true);
      await carregarListaLaudos(session.accessToken, true);
      if (abaAtiva === "mesa" && proximaConversa?.laudoId) {
        await carregarMesaAtual(session.accessToken, proximaConversa.laudoId, true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível reabrir o laudo.";
      Alert.alert("Reabrir laudo", message);
    }
  }

  async function handleSelecionarImagem() {
    if (!session) {
      return;
    }

    await selecionarImagemRascunhoFlow({
      abaAtiva,
      preparandoAnexo,
      uploadArquivosAtivo,
      arquivosPermitidos,
      montarAnexoImagem,
      onSetAnexoMesaRascunho: setAnexoMesaRascunho,
      onSetAnexoRascunho: setAnexoRascunho,
      onSetErroConversa: setErroConversa,
      onSetPreparandoAnexo: setPreparandoAnexo,
    });
  }

  async function handleCapturarImagem() {
    if (!session) {
      return;
    }

    await capturarImagemRascunhoFlow({
      abaAtiva,
      preparandoAnexo,
      uploadArquivosAtivo,
      cameraPermitida,
      montarAnexoImagem,
      onSetAnexoMesaRascunho: setAnexoMesaRascunho,
      onSetAnexoRascunho: setAnexoRascunho,
      onSetErroConversa: setErroConversa,
      onSetPreparandoAnexo: setPreparandoAnexo,
    });
  }

  async function handleSelecionarDocumento() {
    if (!session) {
      return;
    }

    await selecionarDocumentoRascunhoFlow({
      abaAtiva,
      preparandoAnexo,
      uploadArquivosAtivo,
      arquivosPermitidos,
      sessionAccessToken: session.accessToken,
      statusApi,
      erroSugereModoOffline,
      montarAnexoDocumentoLocal,
      montarAnexoDocumentoMesa,
      onSetAnexoMesaRascunho: setAnexoMesaRascunho,
      onSetAnexoRascunho: setAnexoRascunho,
      onSetErroConversa: setErroConversa,
      onSetPreparandoAnexo: setPreparandoAnexo,
      onSetStatusOffline: () => {
        setStatusApi("offline");
      },
    });
  }

  async function handleEnviarMensagem() {
    if (!session) {
      return;
    }

    const snapshotConversa = conversa;
    await sendInspectorMessageFlow<OfflinePendingMessage>({
      mensagem,
      anexoAtual: anexoRascunho,
      snapshotConversa,
      sessionAccessToken: session.accessToken,
      statusApi,
      podeEditarConversaNoComposer,
      textoFallbackAnexo,
      normalizarModoChat,
      inferirSetorConversa,
      montarHistoricoParaEnvio,
      criarMensagemAssistenteServidor,
      carregarConversaAtual: async () => {
        await carregarConversaAtual(session.accessToken, true);
      },
      carregarListaLaudos: async () => {
        await carregarListaLaudos(session.accessToken, true);
      },
      erroSugereModoOffline,
      criarItemFilaOffline,
      onSetMensagem: setMensagem,
      onSetAnexoRascunho: setAnexoRascunho,
      onSetErroConversa: setErroConversa,
      onSetEnviandoMensagem: setEnviandoMensagem,
      onApplyOptimisticMessage: (mensagemOtimista, modoAtivo) => {
        setConversa((estadoAtual) => ({
          laudoId: estadoAtual?.laudoId || null,
          estado: estadoAtual?.estado || "sem_relatorio",
          statusCard: estadoAtual?.statusCard || "aberto",
          permiteEdicao: estadoAtual?.permiteEdicao ?? true,
          permiteReabrir: estadoAtual?.permiteReabrir ?? false,
          laudoCard: estadoAtual?.laudoCard || null,
          modo: normalizarModoChat(estadoAtual?.modo, modoAtivo),
          mensagens: [...(estadoAtual?.mensagens || []), mensagemOtimista],
        }));
      },
      onApplyAssistantResponse: (respostaChat, mensagemAssistenteServidor) => {
        setConversa((estadoAtual) => {
          const base = estadoAtual || criarConversaNova();
          return {
            ...base,
            laudoId: respostaChat.laudoId ?? base.laudoId,
            statusCard: respostaChat.laudoCard?.status_card || base.statusCard,
            laudoCard: respostaChat.laudoCard || base.laudoCard,
            modo: normalizarModoChat(respostaChat.modo, normalizarModoChat(base.modo)),
            mensagens: mensagemAssistenteServidor
              ? [...base.mensagens, mensagemAssistenteServidor]
              : base.mensagens,
          };
        });
      },
      onReverterConversa: () => {
        setConversa(snapshotConversa);
      },
      onQueueOfflineItem: (itemFila) => {
        setFilaOffline((estadoAtual) => [...estadoAtual, itemFila]);
      },
      onSetStatusOffline: () => {
        setStatusApi("offline");
      },
      onRestoreDraft: (texto, anexo) => {
        setMensagem(texto);
        setAnexoRascunho(anexo);
      },
    });
  }

  async function handleEnviarMensagemMesa() {
    if (!session || !conversa) {
      return;
    }

    const referenciaMensagemId = Number(mensagemMesaReferenciaAtiva?.id || 0) || null;
    const snapshotMesa = mensagensMesa;
    await sendMesaMessageFlow<OfflinePendingMessage>({
      mensagemMesa,
      anexoAtual: anexoMesaRascunho,
      referenciaMensagemId,
      conversa: {
        laudoId: conversa.laudoId,
        permiteEdicao: conversa.permiteEdicao,
        laudoCard: conversa.laudoCard,
      },
      mensagensMesa: snapshotMesa,
      sessionAccessToken: session.accessToken,
      sessionUserId: session.bootstrap.usuario.id,
      statusApi,
      carregarListaLaudos: async () => {
        await carregarListaLaudos(session.accessToken, true);
      },
      erroSugereModoOffline,
      textoFallbackAnexo,
      criarItemFilaOffline,
      atualizarResumoLaudoAtual: (resposta) => {
        setConversa((estadoAtual) => atualizarResumoLaudoAtual(estadoAtual, resposta));
      },
      onSetMensagemMesa: setMensagemMesa,
      onSetAnexoMesaRascunho: setAnexoMesaRascunho,
      onSetErroMesa: setErroMesa,
      onSetEnviandoMesa: setEnviandoMesa,
      onSetMensagensMesa: setMensagensMesa,
      onSetMensagensMesaSnapshot: setMensagensMesa,
      onQueueOfflineItem: (itemFila) => {
        setFilaOffline((estadoAtual) => [...estadoAtual, itemFila]);
      },
      onSetStatusOffline: () => {
        setStatusApi("offline");
      },
      onRestoreDraft: (texto, anexo) => {
        setMensagemMesa(texto);
        setAnexoMesaRascunho(anexo);
      },
      onLimparReferenciaMesaAtiva: limparReferenciaMesaAtiva,
      onSetLaudoMesaCarregado: setLaudoMesaCarregado,
    });
  }

  function renderSettingsSheetBody() {
    return renderSettingsSheetBodyContent({
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
      integracaoSincronizandoId,
      integracoesConectadasTotal,
      integracoesDisponiveisTotal,
      integracoesExternas,
      modeloIa,
      nomeAutomaticoConversas,
      novaSenhaDraft,
      novoEmailDraft,
      onAlternarArtigoAjuda: handleAlternarArtigoAjuda,
      onBugDescriptionDraftChange: setBugDescriptionDraft,
      onBugEmailDraftChange: setBugEmailDraft,
      onBuscaAjudaChange: setBuscaAjuda,
      onConfirmarSenhaDraftChange: setConfirmarSenhaDraft,
      onFeedbackDraftChange: setFeedbackDraft,
      onNovaSenhaDraftChange: setNovaSenhaDraft,
      onNovoEmailDraftChange: setNovoEmailDraft,
      onRemoveScreenshot: handleRemoverScreenshotBug,
      onSelectScreenshot: () => {
        void handleSelecionarScreenshotBug();
      },
      onSenhaAtualDraftChange: setSenhaAtualDraft,
      onSyncNow: (item) => {
        void handleSincronizarIntegracaoExterna(item);
      },
      onToggleIntegracao: handleAlternarIntegracaoExterna,
      onToggleNomeAutomaticoConversas: setNomeAutomaticoConversas,
      onToggleUploadArquivos: handleToggleUploadArquivos,
      onSelecionarModeloIa: handleSelecionarModeloIa,
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
      ultimaVerificacaoAtualizacaoLabel,
      ultimoTicketSuporte,
      uploadArquivosAtivo,
    });
  }

  const {
    accentColor,
    appGradientColors,
    artigosAjudaFiltrados,
    buscaConfiguracoesNormalizada,
    chatKeyboardVerticalOffset,
    composerKeyboardBottomOffset,
    contaEmailLabel,
    contaTelefoneLabel,
    conversaAtiva,
    conversaVazia,
    conversasFixadasTotal,
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
    filtrosHistoricoComContagem,
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
    resumoCodigosRecuperacao,
    resumoDadosConversas,
    resumoExcluirConta,
    resumoFilaOffline,
    resumoFilaOfflineFiltrada,
    resumoFilaSuporteLocal,
    resumoHistoricoDrawer,
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
  } = buildInspectorBaseDerivedState({
    anexoMesaRascunho,
    anexoRascunho,
    arquivosPermitidos,
    abaAtiva,
    biometriaPermitida,
    buscaAjuda,
    buscaConfiguracoes,
    buscaHistorico,
    buildHistorySections,
    cameraPermitida,
    carregandoConversa,
    carregandoMesa,
    codigosRecuperacao,
    colorScheme,
    conversa,
    corDestaque,
    densidadeInterface,
    email,
    emailAtualConta,
    enviandoMensagem,
    enviandoMesa,
    eventosSeguranca,
    filaOffline,
    filaSuporteLocal,
    filtroConfiguracoes,
    filtroEventosSeguranca,
    filtroFilaOffline,
    filtroHistorico,
    fixarConversas,
    formatarHorarioAtividade,
    formatarTipoTemplateLaudo,
    historicoOcultoIds,
    idiomaResposta,
    integracoesExternas,
    keyboardHeight,
    laudosDisponiveis,
    lockTimeout,
    memoriaIa,
    mensagem,
    mensagemMesa,
    mensagensMesa,
    microfonePermitido,
    modeloIa,
    mostrarConteudoNotificacao,
    mostrarSomenteNovaMensagem,
    notificacoes,
    notificacoesPermitidas,
    obterEscalaDensidade,
    obterEscalaFonte,
    ocultarConteudoBloqueado,
    pendenciaFilaProntaParaReenvio,
    perfilExibicao,
    perfilNome,
    planoAtual,
    podeEditarConversaNoComposer,
    preparandoAnexo,
    previewChatLiberadoParaConversa,
    prioridadePendenciaOffline,
    provedoresConectados,
    reautenticacaoStatus,
    recoveryCodesEnabled,
    salvarHistoricoConversas,
    session,
    settingsDrawerPage,
    settingsDrawerSection,
    sessoesAtivas,
    somNotificacao,
    statusApi,
    statusAtualizacaoApp,
    sincronizacaoDispositivos,
    tamanhoFonte,
    temaApp,
    twoFactorEnabled,
    twoFactorMethod,
    ultimaVerificacaoAtualizacao,
    uploadArquivosAtivo,
  });
  const settingsDrawerPanelProps = buildInspectorSettingsDrawerPanelProps({
    aprendizadoIa,
    animacoesAtivas,
    arquivosPermitidos,
    artigosAjudaFiltrados,
    backupAutomatico,
    biometriaPermitida,
    cameraPermitida,
    cartaoAtual,
    codigo2FA,
    codigosRecuperacao,
    compartilharMelhoriaIa,
    configuracoesDrawerX,
    contaEmailLabel,
    contaTelefoneLabel,
    conversasOcultasTotal,
    conversasVisiveisTotal,
    corDestaque,
    corDestaqueResumoConfiguracao,
    densidadeInterface,
    deviceBiometricsEnabled,
    economiaDados,
    email,
    emailAtualConta,
    emailsAtivos,
    entradaPorVoz,
    estiloResposta,
    eventosSegurancaFiltrados,
    existeProvedorDisponivel,
    fecharConfiguracoes,
    filaSuporteLocal,
    filtroEventosSeguranca,
    fixarConversas,
    handleAbrirAjustesDoSistema,
    handleAbrirCentralAtividade,
    handleAbrirPaginaConfiguracoes,
    handleAbrirSecaoConfiguracoes,
    handleAlterarEmail,
    handleAlterarSenha,
    handleApagarHistoricoConfiguracoes,
    handleCentralAjuda,
    handleCompartilharCodigosRecuperacao,
    handleConectarProximoProvedorDisponivel,
    handleConfirmarCodigo2FA,
    handleDetalhesSegurancaArquivos,
    handleEncerrarOutrasSessoes,
    handleEncerrarSessao,
    handleEncerrarSessaoAtual,
    handleEncerrarSessoesSuspeitas,
    handleEnviarFeedback,
    handleExcluirConta,
    handleExportarAntesDeExcluirConta,
    handleExportarDados,
    handleExportarDiagnosticoApp,
    handleGerarCodigosRecuperacao,
    handleGerenciarConversasIndividuais,
    handleGerenciarPagamento,
    handleGerenciarPermissao,
    handleGerenciarPlano,
    handleHistoricoPagamentos,
    handleIntegracoesExternas,
    handleLicencas,
    handleLimparFilaSuporteLocal,
    handleLimparTodasConversasConfig,
    handleLogout,
    handleAbrirModeloIa,
    handleMudarMetodo2FA,
    handlePermissoes,
    handlePluginsIa,
    handlePoliticaPrivacidade,
    handleReautenticacaoSensivel,
    handleRefresh,
    handleReportarAtividadeSuspeita,
    handleReportarProblema,
    handleRevisarPermissoesCriticas,
    handleRevisarSessao,
    handleTermosUso,
    handleToggle2FA,
    handleToggleBackupAutomatico,
    handleToggleBiometriaNoDispositivo,
    handleToggleEntradaPorVoz,
    handleToggleMostrarConteudoNotificacao,
    handleToggleMostrarSomenteNovaMensagem,
    handleToggleNotificaPush,
    handleToggleOcultarConteudoBloqueado,
    handleToggleProviderConnection,
    handleToggleRespostaPorVoz,
    handleToggleSincronizacaoDispositivos,
    handleToggleUploadArquivos,
    handleToggleVibracao,
    handleUploadFotoPerfil,
    handleVerificarAtualizacoes,
    handleVoltarResumoConfiguracoes,
    hideInMultitask,
    idiomaApp,
    idiomaResposta,
    iniciaisPerfilConfiguracao,
    integracoesConectadasTotal,
    integracoesDisponiveisTotal,
    lockTimeout,
    memoriaIa,
    microfonePermitido,
    modeloIa,
    mostrarConteudoNotificacao,
    mostrarGrupoContaAcesso,
    mostrarGrupoExperiencia,
    mostrarGrupoSeguranca,
    mostrarGrupoSistema,
    mostrarSomenteNovaMensagem,
    nomeAutomaticoConversas,
    nomeUsuarioExibicao,
    notificaPush,
    notificaRespostas,
    notificacoesPermitidas,
    ocultarConteudoBloqueado,
    onAbrirFilaOffline: () => {
      setFilaOfflineAberta(true);
    },
    outrasSessoesAtivas,
    perfilExibicao,
    perfilExibicaoLabel,
    perfilFotoHint,
    perfilFotoUri,
    perfilNome,
    perfilNomeCompleto,
    permissoesNegadasTotal,
    planoAtual,
    planoResumoConfiguracao,
    previewPrivacidadeNotificacao,
    provedoresConectados,
    provedoresConectadosTotal,
    provedorPrimario,
    reautenticacaoStatus,
    recoveryCodesEnabled,
    regiaoApp,
    requireAuthOnOpen,
    respostaPorVoz,
    resumo2FAFootnote,
    resumo2FAStatus,
    resumoAlertaMetodosConta,
    resumoBlindagemSessoes,
    resumoCodigosRecuperacao,
    resumoDadosConversas,
    resumoExcluirConta,
    resumoFilaSuporteLocal,
    resumoMetodosConta,
    resumoPermissoes,
    resumoPermissoesCriticas,
    resumoPrivacidadeNotificacoes,
    resumoSessaoAtual,
    resumoSuporteApp,
    retencaoDados,
    salvarHistoricoConversas,
    setAnimacoesAtivas,
    setAprendizadoIa,
    setCodigo2FA,
    setCompartilharMelhoriaIa,
    setCorDestaque,
    setDensidadeInterface,
    setEconomiaDados,
    setEmailsAtivos,
    setEstiloResposta,
    setFiltroEventosSeguranca,
    setFixarConversas,
    setHideInMultitask,
    setIdiomaApp,
    setIdiomaResposta,
    setLockTimeout,
    setMemoriaIa,
    setModeloIa,
    setNomeAutomaticoConversas,
    setNotificaRespostas,
    setPerfilExibicao,
    setPerfilNome,
    setRecoveryCodesEnabled,
    setRegiaoApp,
    setRequireAuthOnOpen,
    setRetencaoDados,
    setSalvarHistoricoConversas,
    setSomNotificacao,
    setTamanhoFonte,
    setTemperaturaIa,
    setTemaApp,
    setTomConversa,
    setUsoBateria,
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
    sessoesAtivas,
    sessoesSuspeitasTotal,
    sincronizacaoDispositivos,
    somNotificacao,
    tamanhoFonte,
    temperaturaIa,
    temaApp,
    temaResumoConfiguracao,
    temPrioridadesConfiguracao,
    ticketsBugTotal,
    ticketsFeedbackTotal,
    tomConversa,
    totalSecoesConfiguracaoVisiveis,
    twoFactorEnabled,
    twoFactorMethod,
    ultimaVerificacaoAtualizacaoLabel,
    ultimoEventoProvedor,
    ultimoEventoSessao,
    ultimoTicketSuporteResumo,
    uploadArquivosAtivo,
    usoBateria,
    vibracaoAtiva,
    workspaceResumoConfiguracao,
  });
  const notificacoesMesaLaudoAtual = notificacoes.filter(
    (item) => item.unread && item.targetThread === "mesa" && item.laudoId === laudoSelecionadoId,
  ).length;
  const ultimaNotificacao = notificacoes[0] || null;
  const algumPainelLateralAberto = historicoAberto || configuracoesAberta;
  const sessionModalsStackProps = buildInspectorSessionModalsStackProps({
    anexosAberto,
    bloqueioAppAtivo,
    centralAtividadeAberta,
    confirmSheet,
    confirmTextDraft,
    detalheStatusPendenciaOffline,
    deviceBiometricsEnabled,
    fecharConfirmacaoConfiguracao,
    fecharSheetConfiguracao,
    filaOfflineAberta,
    filaOfflineFiltrada,
    filaOfflineOrdenada,
    filtroFilaOffline,
    filtrosFilaOffline,
    formatarHorarioAtividade,
    handleAbrirNotificacao,
    handleConfirmarAcaoCritica,
    handleConfirmarSettingsSheet,
    handleDesbloquearAplicativo,
    handleEscolherAnexo,
    handleLogout,
    handleRetomarItemFilaOffline,
    iconePendenciaOffline,
    legendaPendenciaOffline,
    monitorandoAtividade,
    notificacoes,
    pendenciaFilaProntaParaReenvio,
    podeSincronizarFilaOffline,
    previewAnexoImagem,
    removerItemFilaOffline,
    renderSettingsSheetBody,
    resumoFilaOfflineFiltrada,
    resumoPendenciaOffline,
    rotuloStatusPendenciaOffline,
    session,
    setAnexosAberto,
    setCentralAtividadeAberta,
    setConfirmTextDraft,
    setFilaOfflineAberta,
    setFiltroFilaOffline,
    setPreviewAnexoImagem,
    settingsSheet,
    settingsSheetLoading,
    settingsSheetNotice,
    sincronizacaoDispositivos,
    sincronizarFilaOffline,
    sincronizarItemFilaOffline,
    sincronizandoFilaOffline,
    sincronizandoItemFilaId,
    statusApi,
  });
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
    const authenticatedLayoutProps = buildAuthenticatedLayoutProps({
      accentColor,
      animacoesAtivas,
      anexoAbrindoChave,
      anexoMesaRascunho,
      anexoRascunho,
      appGradientColors,
      abrirReferenciaNoChat,
      buscaHistorico,
      carregandoConversa,
      carregandoMesa,
      chatKeyboardVerticalOffset,
      chipsContextoThread,
      composerKeyboardBottomOffset,
      configuracoesAberta,
      conversaAtiva,
      conversaVazia,
      conversasFixadasTotal,
      conversasOcultasTotal,
      conversasVisiveisTotal,
      definirReferenciaMesaAtiva,
      drawerOverlayOpacity,
      dynamicComposerInputStyle,
      dynamicMessageBubbleStyle,
      dynamicMessageTextStyle,
      enviandoMensagem,
      enviandoMesa,
      erroConversa,
      erroLaudos,
      erroMesa,
      fecharHistorico,
      fecharPaineisLaterais,
      filaOfflineOrdenada,
      filtroHistorico,
      filtrosHistoricoComContagem,
      formatarHorarioAtividade,
      formatarTipoTemplateLaudo,
      handleAbrirAnexo,
      handleAbrirConfiguracoes,
      handleAbrirHistorico,
      handleAbrirSeletorAnexo,
      handleAlternarFixadoHistorico,
      handleEnviarMensagem,
      handleEnviarMensagemMesa,
      handleExcluirConversaHistorico,
      handleReabrir,
      handleSelecionarHistorico,
      headerSafeTopInset,
      historicoAberto,
      historicoAgrupadoFinal,
      historicoDrawerX,
      historicoVazioTexto,
      historicoVazioTitulo,
      historyDrawerPanResponder,
      historyEdgePanResponder,
      introVisivel,
      keyboardAvoidingBehavior,
      keyboardVisible,
      laudoContextDescription,
      laudoContextTitle,
      laudoSelecionadoId,
      limparReferenciaMesaAtiva,
      mesaDisponivel,
      mesaTemMensagens,
      mensagem,
      mensagemChatDestacadaId,
      mensagemMesa,
      mensagemMesaReferenciaAtiva,
      mensagensMesa,
      mensagensVisiveis,
      mostrarContextoThread,
      nomeUsuarioExibicao,
      notificacoesMesaLaudoAtual,
      notificacoesNaoLidas,
      obterResumoReferenciaMensagem,
      placeholderComposer,
      placeholderMesa,
      podeAbrirAnexosChat,
      podeAbrirAnexosMesa,
      podeAcionarComposer,
      podeEnviarComposer,
      podeEnviarMesa,
      podeUsarComposerMesa,
      registrarLayoutMensagemChat,
      resumoHistoricoDrawer,
      scrollRef,
      sessionAccessToken: session.accessToken,
      sessionModalsStackProps,
      setAbaAtiva,
      setAnexoMesaRascunho,
      setAnexoRascunho,
      setBuscaHistorico,
      setFiltroHistorico,
      setIntroVisivel,
      setMensagem,
      setMensagemMesa,
      settingsDrawerPanelProps,
      settingsEdgePanResponder,
      threadInsights,
      threadKeyboardPaddingBottom,
      threadSpotlight,
      vendoMesa,
      chaveAnexo,
    });

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

