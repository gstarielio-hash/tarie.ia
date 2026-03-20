import type { ColorSchemeName } from "react-native";

import type {
  ApiHealthStatus,
  MobileLaudoCard,
  MobileMesaMessage,
} from "../../types/mobile";
import {
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  HISTORY_DRAWER_FILTERS,
  SETTINGS_DRAWER_FILTERS,
} from "../InspectorMobileApp.constants";
import type {
  ActiveThread,
  ChatState,
  ComposerAttachment,
  MobileActivityNotification,
  OfflinePendingMessage,
} from "../chat/types";
import type {
  ThreadChip,
  ThreadInsight,
  ThreadSpotlight,
} from "../chat/ThreadContextCard";
import type { HistoryDrawerSection } from "../history/HistoryDrawerPanel";
import type { OfflineQueueFilter } from "./SessionModalsStack";
import type { MobileSessionState } from "../session/sessionTypes";
import type {
  ConnectedProvider,
  ExternalIntegration,
  SecurityEventFilter,
  SecurityEventItem,
  SessionDevice,
  SupportQueueItem,
} from "../settings/useSettingsPresentation";
import type {
  SettingsDrawerPage,
  SettingsSectionKey,
} from "../settings/settingsNavigationMeta";

export type HistoryDrawerFilter =
  (typeof HISTORY_DRAWER_FILTERS)[number]["key"];
export type SettingsDrawerFilter =
  (typeof SETTINGS_DRAWER_FILTERS)[number]["key"];
export type SettingsDrawerSectionKey = SettingsSectionKey | "all";

export interface InspectorConversationDerivedStateInput {
  abaAtiva: ActiveThread;
  anexoMesaRascunho: ComposerAttachment | null;
  anexoRascunho: ComposerAttachment | null;
  arquivosPermitidos: boolean;
  carregandoConversa: boolean;
  carregandoMesa: boolean;
  colorScheme: ColorSchemeName;
  conversa: ChatState | null;
  corDestaque: string;
  densidadeInterface: (typeof DENSITY_OPTIONS)[number];
  enviandoMensagem: boolean;
  enviandoMesa: boolean;
  formatarTipoTemplateLaudo: (tipo: string | null | undefined) => string;
  mensagem: string;
  mensagemMesa: string;
  mensagensMesa: MobileMesaMessage[];
  obterEscalaDensidade: (value: (typeof DENSITY_OPTIONS)[number]) => number;
  obterEscalaFonte: (value: (typeof FONT_SIZE_OPTIONS)[number]) => number;
  podeEditarConversaNoComposer: (conversa: ChatState | null) => boolean;
  preparandoAnexo: boolean;
  previewChatLiberadoParaConversa: (conversa: ChatState | null) => boolean;
  tamanhoFonte: (typeof FONT_SIZE_OPTIONS)[number];
  temaApp: string;
  uploadArquivosAtivo: boolean;
}

export interface InspectorHistoryAndOfflineDerivedStateInput {
  buscaHistorico: string;
  buildHistorySections: (
    items: MobileLaudoCard[],
  ) => HistoryDrawerSection<MobileLaudoCard>[];
  filaOffline: OfflinePendingMessage[];
  filtroFilaOffline: OfflineQueueFilter;
  filtroHistorico: HistoryDrawerFilter;
  fixarConversas: boolean;
  historicoOcultoIds: number[];
  laudosDisponiveis: MobileLaudoCard[];
  notificacoes: MobileActivityNotification[];
  pendenciaFilaProntaParaReenvio: (item: OfflinePendingMessage) => boolean;
  prioridadePendenciaOffline: (item: OfflinePendingMessage) => number;
  statusApi: ApiHealthStatus;
}

export interface InspectorSettingsDerivedStateInput {
  arquivosPermitidos: boolean;
  biometriaPermitida: boolean;
  buscaAjuda: string;
  buscaConfiguracoes: string;
  cameraPermitida: boolean;
  codigosRecuperacao: string[];
  contaTelefone: string;
  corDestaque: string;
  densidadeInterface: (typeof DENSITY_OPTIONS)[number];
  email: string;
  emailAtualConta: string;
  estiloResposta: string;
  eventosSeguranca: SecurityEventItem[];
  filaSuporteLocal: SupportQueueItem[];
  filtroConfiguracoes: SettingsDrawerFilter;
  filtroEventosSeguranca: SecurityEventFilter;
  formatarHorarioAtividade: (value: string) => string;
  formatarTipoTemplateLaudo: (tipo: string | null | undefined) => string;
  idiomaResposta: string;
  integracoesExternas: ExternalIntegration[];
  lockTimeout: string;
  microfonePermitido: boolean;
  modeloIa: string;
  mostrarConteudoNotificacao: boolean;
  mostrarSomenteNovaMensagem: boolean;
  notificacoesPermitidas: boolean;
  ocultarConteudoBloqueado: boolean;
  perfilExibicao: string;
  perfilNome: string;
  planoAtual: string;
  provedoresConectados: ConnectedProvider[];
  reautenticacaoStatus: string;
  recoveryCodesEnabled: boolean;
  salvarHistoricoConversas: boolean;
  session: MobileSessionState | null;
  settingsDrawerPage: SettingsDrawerPage;
  settingsDrawerSection: SettingsDrawerSectionKey;
  sessoesAtivas: SessionDevice[];
  sincronizacaoDispositivos: boolean;
  somNotificacao: string;
  statusAtualizacaoApp: string;
  temaApp: string;
  twoFactorEnabled: boolean;
  twoFactorMethod: string;
  ultimaVerificacaoAtualizacao: string;
  tamanhoFonte: (typeof FONT_SIZE_OPTIONS)[number];
}

export interface InspectorSettingsDerivedStateResolvedInput extends InspectorSettingsDerivedStateInput {
  conversasFixadasTotal: number;
  conversasVisiveisTotal: number;
  temaEfetivo: string;
}

export interface InspectorLayoutDerivedStateInput {
  keyboardHeight: number;
}

export type InspectorBaseDerivedStateInput =
  InspectorConversationDerivedStateInput &
    InspectorHistoryAndOfflineDerivedStateInput &
    InspectorSettingsDerivedStateInput &
    InspectorLayoutDerivedStateInput;

export interface BuildInspectorBaseDerivedStateInputParams {
  chat: Pick<
    InspectorConversationDerivedStateInput,
    | "anexoMesaRascunho"
    | "anexoRascunho"
    | "carregandoConversa"
    | "carregandoMesa"
    | "conversa"
    | "enviandoMensagem"
    | "enviandoMesa"
    | "mensagem"
    | "mensagemMesa"
    | "mensagensMesa"
    | "preparandoAnexo"
  >;
  helpers: Pick<
    InspectorConversationDerivedStateInput,
    | "formatarTipoTemplateLaudo"
    | "obterEscalaDensidade"
    | "obterEscalaFonte"
    | "podeEditarConversaNoComposer"
    | "previewChatLiberadoParaConversa"
  > &
    Pick<InspectorHistoryAndOfflineDerivedStateInput, "buildHistorySections"> &
    Pick<InspectorSettingsDerivedStateInput, "formatarHorarioAtividade">;
  historyAndOffline: Pick<
    InspectorHistoryAndOfflineDerivedStateInput,
    | "buscaHistorico"
    | "filaOffline"
    | "filtroFilaOffline"
    | "filtroHistorico"
    | "fixarConversas"
    | "historicoOcultoIds"
    | "laudosDisponiveis"
    | "notificacoes"
    | "pendenciaFilaProntaParaReenvio"
    | "prioridadePendenciaOffline"
  > &
    Pick<
      InspectorSettingsDerivedStateInput,
      "eventosSeguranca" | "filaSuporteLocal" | "filtroEventosSeguranca"
    >;
  settingsAndAccount: Pick<
    InspectorConversationDerivedStateInput,
    | "arquivosPermitidos"
    | "corDestaque"
    | "densidadeInterface"
    | "tamanhoFonte"
    | "temaApp"
    | "uploadArquivosAtivo"
  > &
    Pick<
      InspectorSettingsDerivedStateInput,
      | "biometriaPermitida"
      | "cameraPermitida"
      | "codigosRecuperacao"
      | "contaTelefone"
      | "email"
      | "emailAtualConta"
      | "estiloResposta"
      | "idiomaResposta"
      | "integracoesExternas"
      | "lockTimeout"
      | "microfonePermitido"
      | "modeloIa"
      | "mostrarConteudoNotificacao"
      | "mostrarSomenteNovaMensagem"
      | "notificacoesPermitidas"
      | "ocultarConteudoBloqueado"
      | "perfilExibicao"
      | "perfilNome"
      | "planoAtual"
      | "provedoresConectados"
      | "reautenticacaoStatus"
      | "recoveryCodesEnabled"
      | "salvarHistoricoConversas"
      | "settingsDrawerPage"
      | "settingsDrawerSection"
      | "sessoesAtivas"
      | "somNotificacao"
      | "sincronizacaoDispositivos"
      | "twoFactorEnabled"
      | "twoFactorMethod"
    >;
  shell: Pick<
    InspectorConversationDerivedStateInput,
    "abaAtiva" | "colorScheme"
  > &
    Pick<InspectorLayoutDerivedStateInput, "keyboardHeight"> &
    Pick<
      InspectorSettingsDerivedStateInput,
      | "filtroConfiguracoes"
      | "buscaAjuda"
      | "buscaConfiguracoes"
      | "session"
      | "statusAtualizacaoApp"
      | "ultimaVerificacaoAtualizacao"
    > &
    Pick<InspectorHistoryAndOfflineDerivedStateInput, "statusApi">;
}

export interface BuildThreadContextStateInput {
  conversaAtiva: ChatState | null;
  filtrarThreadContextChips: (items: Array<ThreadChip | null>) => ThreadChip[];
  mapearStatusLaudoVisual: (statusCard: string) => {
    tone: ThreadSpotlight["tone"];
    icon: ThreadSpotlight["icon"];
  };
  mesaDisponivel: boolean;
  mesaTemMensagens: boolean;
  mensagensMesa: MobileMesaMessage[];
  notificacoesMesaLaudoAtual: number;
  resumoFilaOffline: string;
  statusApi: ApiHealthStatus;
  tipoTemplateAtivoLabel: string;
  vendoMesa: boolean;
}

export interface ThreadContextStateResult {
  chipsContextoThread: ThreadChip[];
  laudoContextDescription: string;
  laudoContextTitle: string;
  mostrarContextoThread: boolean;
  statusVisualLaudo: {
    tone: ThreadSpotlight["tone"];
    icon: ThreadSpotlight["icon"];
  };
  threadInsights: ThreadInsight[];
  threadSpotlight: ThreadSpotlight;
}
