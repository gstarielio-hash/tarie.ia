import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { Animated, PanResponderInstance, ScrollView } from "react-native";

import type { ApiHealthStatus, MobileLaudoCard } from "../../types/mobile";
import type {
  MobileActivityNotification,
  OfflinePendingMessage,
  ActiveThread,
  ChatState,
  ComposerAttachment,
  MessageReferenceState,
} from "../chat/types";
import type { ThreadComposerPanelProps } from "../chat/ThreadComposerPanel";
import type { ThreadConversationPaneProps } from "../chat/ThreadConversationPane";
import type { ThreadContextCardProps } from "../chat/ThreadContextCard";
import type { ThreadHeaderControlsProps } from "../chat/ThreadHeaderControls";
import type {
  HistoryDrawerPanelProps,
  HistoryDrawerSection,
} from "../history/HistoryDrawerPanel";
import type { MobileSessionState } from "../session/sessionTypes";
import type { SettingsDrawerPanelProps } from "../settings/SettingsDrawerPanel";
import type {
  ConfirmSheetState,
  SettingsSheetState,
} from "../settings/settingsSheetTypes";
import type {
  OfflineQueueFilter,
  SessionModalsStackFilter,
  SessionModalsStackProps,
} from "./SessionModalsStack";

export interface AttachmentPreviewState {
  titulo: string;
  uri: string;
}

export interface AuthenticatedLayoutShellInput {
  accentColor: string;
  animacoesAtivas: boolean;
  appGradientColors: readonly [string, string, ...string[]];
  chatKeyboardVerticalOffset: number;
  composerNotice: string;
  configuracoesAberta: boolean;
  drawerOverlayOpacity: Animated.Value;
  erroConversa: string;
  erroLaudos: string;
  fecharPaineisLaterais: () => void;
  introVisivel: boolean;
  keyboardAvoidingBehavior: "padding" | "height" | undefined;
  keyboardVisible: boolean;
  onVoiceInputPress: ThreadComposerPanelProps["onVoiceInputPress"];
  sessionModalsStackProps: SessionModalsStackProps;
  setIntroVisivel: Dispatch<SetStateAction<boolean>>;
  settingsDrawerPanelProps: SettingsDrawerPanelProps;
  settingsEdgePanResponder: PanResponderInstance;
  vendoMesa: boolean;
}

export interface AuthenticatedLayoutHistoryInput {
  buscaHistorico: string;
  conversasOcultasTotal: number;
  fecharHistorico: (options?: {
    limparBusca?: boolean;
    manterOverlay?: boolean;
  }) => void;
  handleAbrirHistorico: () => void;
  handleExcluirConversaHistorico: (item: MobileLaudoCard) => void;
  handleSelecionarHistorico: (item: MobileLaudoCard) => Promise<void>;
  historicoAberto: boolean;
  historicoAgrupadoFinal: HistoryDrawerSection<MobileLaudoCard>[];
  historicoDrawerX: Animated.Value;
  historicoVazioTexto: string;
  historicoVazioTitulo: string;
  historyDrawerPanResponder: PanResponderInstance;
  historyEdgePanResponder: PanResponderInstance;
  laudoSelecionadoId: number | null;
  setBuscaHistorico: Dispatch<SetStateAction<string>>;
}

export interface AuthenticatedLayoutThreadInput {
  abrirReferenciaNoChat: (id: number) => Promise<void>;
  chipsContextoThread: ThreadContextCardProps["chips"];
  chaveAnexo: ThreadConversationPaneProps["toAttachmentKey"];
  conversaAtiva: ChatState | null;
  conversaVazia: boolean;
  definirReferenciaMesaAtiva: ThreadConversationPaneProps["onDefinirReferenciaMesaAtiva"];
  dynamicMessageBubbleStyle: ThreadConversationPaneProps["dynamicMessageBubbleStyle"];
  dynamicMessageTextStyle: ThreadConversationPaneProps["dynamicMessageTextStyle"];
  filaOfflineOrdenada: readonly OfflinePendingMessage[];
  handleAbrirAnexo: ThreadConversationPaneProps["onAbrirAnexo"];
  handleAbrirConfiguracoes: () => void;
  handleAbrirNovoChat: () => Promise<void>;
  headerSafeTopInset: number;
  laudoContextDescription: string;
  laudoContextTitle: string;
  mesaDisponivel: boolean;
  mesaTemMensagens: boolean;
  mensagemChatDestacadaId: number | null;
  mensagensMesa: ThreadConversationPaneProps["mensagensMesa"];
  mensagensVisiveis: ThreadConversationPaneProps["mensagensVisiveis"];
  mostrarContextoThread: boolean;
  nomeUsuarioExibicao: string;
  notificacoesMesaLaudoAtual: number;
  notificacoesNaoLidas: number;
  obterResumoReferenciaMensagem: ThreadConversationPaneProps["obterResumoReferenciaMensagem"];
  registrarLayoutMensagemChat: ThreadConversationPaneProps["onRegistrarLayoutMensagemChat"];
  threadInsights: ThreadContextCardProps["insights"];
  threadKeyboardPaddingBottom: number;
  threadSpotlight: ThreadContextCardProps["spotlight"];
}

export interface AuthenticatedLayoutComposerInput {
  anexoAbrindoChave: string;
  anexoMesaRascunho: ThreadComposerPanelProps["anexoMesaRascunho"];
  anexoRascunho: ThreadComposerPanelProps["anexoRascunho"];
  carregandoConversa: boolean;
  carregandoMesa: boolean;
  dynamicComposerInputStyle: ThreadComposerPanelProps["dynamicComposerInputStyle"];
  enviandoMensagem: boolean;
  enviandoMesa: boolean;
  erroMesa: string;
  handleAbrirSeletorAnexo: () => void;
  handleEnviarMensagem: () => Promise<void>;
  handleEnviarMensagemMesa: () => Promise<void>;
  handleReabrir: () => Promise<void>;
  limparReferenciaMesaAtiva: () => void;
  mensagem: string;
  mensagemMesa: string;
  mensagemMesaReferenciaAtiva: MessageReferenceState | null;
  placeholderComposer: string;
  placeholderMesa: string;
  podeAbrirAnexosChat: boolean;
  podeAbrirAnexosMesa: boolean;
  podeAcionarComposer: boolean;
  podeEnviarComposer: boolean;
  podeEnviarMesa: boolean;
  podeUsarComposerMesa: boolean;
  setAnexoMesaRascunho: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setAnexoRascunho: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setMensagem: Dispatch<SetStateAction<string>>;
  setMensagemMesa: Dispatch<SetStateAction<string>>;
  showVoiceInputAction: boolean;
  voiceInputEnabled: boolean;
}

export interface AuthenticatedLayoutSessionInput {
  scrollRef: RefObject<ScrollView | null>;
  sessionAccessToken: string;
  setAbaAtiva: Dispatch<SetStateAction<ActiveThread>>;
}

export type AuthenticatedLayoutInput = AuthenticatedLayoutShellInput &
  AuthenticatedLayoutHistoryInput &
  AuthenticatedLayoutThreadInput &
  AuthenticatedLayoutComposerInput &
  AuthenticatedLayoutSessionInput;

export interface BuildAuthenticatedLayoutInputParams {
  composer: AuthenticatedLayoutComposerInput;
  history: AuthenticatedLayoutHistoryInput;
  session: AuthenticatedLayoutSessionInput;
  shell: AuthenticatedLayoutShellInput;
  thread: AuthenticatedLayoutThreadInput;
}

export interface InspectorSessionModalsActivityAndLockInput {
  bloqueioAppAtivo: boolean;
  centralAtividadeAberta: boolean;
  deviceBiometricsEnabled: boolean;
  formatarHorarioAtividade: (value: string) => string;
  handleAbrirNotificacao: (item: MobileActivityNotification) => Promise<void>;
  handleDesbloquearAplicativo: () => void;
  handleLogout: () => Promise<void>;
  monitorandoAtividade: boolean;
  notificacoes: readonly MobileActivityNotification[];
  session: MobileSessionState | null;
  setCentralAtividadeAberta: Dispatch<SetStateAction<boolean>>;
}

export interface InspectorSessionModalsAttachmentInput {
  anexosAberto: boolean;
  handleEscolherAnexo: (
    option: "camera" | "galeria" | "documento",
  ) => Promise<void>;
  previewAnexoImagem: AttachmentPreviewState | null;
  setAnexosAberto: Dispatch<SetStateAction<boolean>>;
  setPreviewAnexoImagem: Dispatch<
    SetStateAction<AttachmentPreviewState | null>
  >;
}

export interface InspectorSessionModalsOfflineQueueInput {
  detalheStatusPendenciaOffline: (item: OfflinePendingMessage) => string;
  filaOfflineAberta: boolean;
  filaOfflineFiltrada: readonly OfflinePendingMessage[];
  filaOfflineOrdenada: readonly OfflinePendingMessage[];
  filtroFilaOffline: OfflineQueueFilter;
  filtrosFilaOffline: readonly SessionModalsStackFilter[];
  handleRetomarItemFilaOffline: (item: OfflinePendingMessage) => Promise<void>;
  iconePendenciaOffline: SessionModalsStackProps["iconePendenciaOffline"];
  legendaPendenciaOffline: SessionModalsStackProps["legendaPendenciaOffline"];
  pendenciaFilaProntaParaReenvio: (item: OfflinePendingMessage) => boolean;
  podeSincronizarFilaOffline: boolean;
  removerItemFilaOffline: (id: string) => void;
  resumoFilaOfflineFiltrada: string;
  resumoPendenciaOffline: (item: OfflinePendingMessage) => string;
  rotuloStatusPendenciaOffline: (item: OfflinePendingMessage) => string;
  setFilaOfflineAberta: Dispatch<SetStateAction<boolean>>;
  setFiltroFilaOffline: Dispatch<SetStateAction<OfflineQueueFilter>>;
  sincronizacaoDispositivos: boolean;
  sincronizarFilaOffline: (accessToken: string) => Promise<void>;
  sincronizarItemFilaOffline: (item: OfflinePendingMessage) => Promise<void>;
  sincronizandoFilaOffline: boolean;
  sincronizandoItemFilaId: string;
  statusApi: ApiHealthStatus;
}

export interface InspectorSessionModalsSettingsInput {
  confirmSheet: ConfirmSheetState | null;
  confirmTextDraft: string;
  fecharConfirmacaoConfiguracao: () => void;
  fecharSheetConfiguracao: () => void;
  handleConfirmarAcaoCritica: () => void;
  handleConfirmarSettingsSheet: () => Promise<void>;
  renderSettingsSheetBody: () => ReactNode;
  setConfirmTextDraft: Dispatch<SetStateAction<string>>;
  settingsSheet: SettingsSheetState | null;
  settingsSheetLoading: boolean;
  settingsSheetNotice: string;
}

export type InspectorSessionModalsInput =
  InspectorSessionModalsActivityAndLockInput &
    InspectorSessionModalsAttachmentInput &
    InspectorSessionModalsOfflineQueueInput &
    InspectorSessionModalsSettingsInput;

export interface BuildInspectorSessionModalsInputParams {
  activityAndLock: InspectorSessionModalsActivityAndLockInput;
  attachment: InspectorSessionModalsAttachmentInput;
  offlineQueue: InspectorSessionModalsOfflineQueueInput;
  settings: InspectorSessionModalsSettingsInput;
}

export type HistoryDrawerPanelMobileProps =
  HistoryDrawerPanelProps<MobileLaudoCard>;
export type ThreadHeaderControlsPanelProps = ThreadHeaderControlsProps;
export type ThreadContextCardPanelProps = Omit<
  ThreadContextCardProps,
  "visible"
>;
