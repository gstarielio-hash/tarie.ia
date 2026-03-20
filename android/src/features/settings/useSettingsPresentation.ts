import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState, type Dispatch, type SetStateAction } from "react";

import {
  EXTERNAL_INTEGRATION_OPTIONS,
  HELP_CENTER_ARTICLES,
  PAYMENT_CARD_OPTIONS,
  PLAN_OPTIONS,
  SECURITY_EVENT_FILTERS,
  TWO_FACTOR_METHOD_OPTIONS,
} from "../InspectorMobileApp.constants";
import type { ComposerAttachment } from "../chat/types";

export type ConnectedProviderId = "google" | "apple" | "microsoft";
export type ExternalIntegrationId =
  (typeof EXTERNAL_INTEGRATION_OPTIONS)[number]["id"];
export type SecurityEventFilter = (typeof SECURITY_EVENT_FILTERS)[number];

export interface ConnectedProvider {
  id: ConnectedProviderId;
  label: string;
  email: string;
  connected: boolean;
  requiresReauth: boolean;
}

export interface ExternalIntegration {
  id: ExternalIntegrationId;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  connected: boolean;
  lastSyncAt: string;
}

export interface SessionDevice {
  id: string;
  title: string;
  meta: string;
  location: string;
  lastSeen: string;
  current: boolean;
  suspicious?: boolean;
}

export interface SecurityEventItem {
  id: string;
  title: string;
  meta: string;
  status: string;
  type: "login" | "provider" | "2fa" | "data" | "session";
  critical?: boolean;
}

export interface SupportQueueItem {
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

const DEFAULT_PLAN = PLAN_OPTIONS[1] ?? "Pro";
const DEFAULT_PAYMENT_CARD = PAYMENT_CARD_OPTIONS[0] ?? "Visa final 4242";
const DEFAULT_TWO_FACTOR_METHOD =
  TWO_FACTOR_METHOD_OPTIONS[0] ?? "App autenticador";
const DEFAULT_REAUTH_STATUS = "Não confirmada";
const DEFAULT_REAUTH_REASON =
  "Confirme sua identidade para liberar ações críticas no app do inspetor.";
const DEFAULT_UPDATE_STATUS = "Nenhuma verificação recente";
const DEFAULT_HELP_ARTICLE_ID = HELP_CENTER_ARTICLES[0]?.id ?? "";

function criarEventosSegurancaPadrao(): SecurityEventItem[] {
  return [
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
  ];
}

export function criarProvedoresConectadosPadrao(
  emailConta = "",
): ConnectedProvider[] {
  return [
    {
      id: "google",
      label: "Google",
      email: "",
      connected: false,
      requiresReauth: true,
    },
    {
      id: "apple",
      label: "Apple",
      email: "",
      connected: false,
      requiresReauth: true,
    },
    {
      id: "microsoft",
      label: "Microsoft",
      email: emailConta,
      connected: true,
      requiresReauth: true,
    },
  ];
}

export function criarSessoesAtivasPadrao(): SessionDevice[] {
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

export function criarIntegracoesExternasPadrao(): ExternalIntegration[] {
  return EXTERNAL_INTEGRATION_OPTIONS.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    icon: item.icon as keyof typeof MaterialCommunityIcons.glyphMap,
    connected: false,
    lastSyncAt: "",
  }));
}

interface UseSettingsPresentationState {
  nomeCompletoDraft: string;
  nomeExibicaoDraft: string;
  telefoneDraft: string;
  novoEmailDraft: string;
  senhaAtualDraft: string;
  novaSenhaDraft: string;
  confirmarSenhaDraft: string;
  planoAtual: (typeof PLAN_OPTIONS)[number];
  cartaoAtual: (typeof PAYMENT_CARD_OPTIONS)[number];
  nomeAutomaticoConversas: boolean;
  fixarConversas: boolean;
  provedoresConectados: ConnectedProvider[];
  integracoesExternas: ExternalIntegration[];
  sessoesAtivas: SessionDevice[];
  twoFactorEnabled: boolean;
  twoFactorMethod: (typeof TWO_FACTOR_METHOD_OPTIONS)[number];
  recoveryCodesEnabled: boolean;
  codigo2FA: string;
  codigosRecuperacao: string[];
  reautenticacaoStatus: string;
  reautenticacaoExpiraEm: string;
  reauthReason: string;
  filtroEventosSeguranca: SecurityEventFilter;
  eventosSeguranca: SecurityEventItem[];
  buscaAjuda: string;
  artigoAjudaExpandidoId: string;
  filaSuporteLocal: SupportQueueItem[];
  ultimaVerificacaoAtualizacao: string;
  statusAtualizacaoApp: string;
  feedbackDraft: string;
  bugDescriptionDraft: string;
  bugEmailDraft: string;
  bugAttachmentDraft: ComposerAttachment | null;
  integracaoSincronizandoId: ExternalIntegrationId | "";
}

interface UseSettingsPresentationActions {
  setNomeCompletoDraft: Dispatch<SetStateAction<string>>;
  setNomeExibicaoDraft: Dispatch<SetStateAction<string>>;
  setTelefoneDraft: Dispatch<SetStateAction<string>>;
  setNovoEmailDraft: Dispatch<SetStateAction<string>>;
  setSenhaAtualDraft: Dispatch<SetStateAction<string>>;
  setNovaSenhaDraft: Dispatch<SetStateAction<string>>;
  setConfirmarSenhaDraft: Dispatch<SetStateAction<string>>;
  setPlanoAtual: Dispatch<SetStateAction<(typeof PLAN_OPTIONS)[number]>>;
  setCartaoAtual: Dispatch<
    SetStateAction<(typeof PAYMENT_CARD_OPTIONS)[number]>
  >;
  setNomeAutomaticoConversas: Dispatch<SetStateAction<boolean>>;
  setFixarConversas: Dispatch<SetStateAction<boolean>>;
  setProvedoresConectados: Dispatch<SetStateAction<ConnectedProvider[]>>;
  setIntegracoesExternas: Dispatch<SetStateAction<ExternalIntegration[]>>;
  setSessoesAtivas: Dispatch<SetStateAction<SessionDevice[]>>;
  setTwoFactorEnabled: Dispatch<SetStateAction<boolean>>;
  setTwoFactorMethod: Dispatch<
    SetStateAction<(typeof TWO_FACTOR_METHOD_OPTIONS)[number]>
  >;
  setRecoveryCodesEnabled: Dispatch<SetStateAction<boolean>>;
  setCodigo2FA: Dispatch<SetStateAction<string>>;
  setCodigosRecuperacao: Dispatch<SetStateAction<string[]>>;
  setReautenticacaoStatus: Dispatch<SetStateAction<string>>;
  setReautenticacaoExpiraEm: Dispatch<SetStateAction<string>>;
  setReauthReason: Dispatch<SetStateAction<string>>;
  setFiltroEventosSeguranca: Dispatch<SetStateAction<SecurityEventFilter>>;
  setEventosSeguranca: Dispatch<SetStateAction<SecurityEventItem[]>>;
  setBuscaAjuda: Dispatch<SetStateAction<string>>;
  setArtigoAjudaExpandidoId: Dispatch<SetStateAction<string>>;
  setFilaSuporteLocal: Dispatch<SetStateAction<SupportQueueItem[]>>;
  setUltimaVerificacaoAtualizacao: Dispatch<SetStateAction<string>>;
  setStatusAtualizacaoApp: Dispatch<SetStateAction<string>>;
  setFeedbackDraft: Dispatch<SetStateAction<string>>;
  setBugDescriptionDraft: Dispatch<SetStateAction<string>>;
  setBugEmailDraft: Dispatch<SetStateAction<string>>;
  setBugAttachmentDraft: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setIntegracaoSincronizandoId: Dispatch<
    SetStateAction<ExternalIntegrationId | "">
  >;
  clearTransientSettingsPresentationState: () => void;
  resetSessionBoundSettingsPresentationState: () => void;
  resetSettingsPresentationAfterAccountDeletion: () => void;
}

export function useSettingsPresentation(): {
  state: UseSettingsPresentationState;
  actions: UseSettingsPresentationActions;
} {
  const [nomeCompletoDraft, setNomeCompletoDraft] = useState("");
  const [nomeExibicaoDraft, setNomeExibicaoDraft] = useState("");
  const [telefoneDraft, setTelefoneDraft] = useState("");
  const [novoEmailDraft, setNovoEmailDraft] = useState("");
  const [senhaAtualDraft, setSenhaAtualDraft] = useState("");
  const [novaSenhaDraft, setNovaSenhaDraft] = useState("");
  const [confirmarSenhaDraft, setConfirmarSenhaDraft] = useState("");
  const [planoAtual, setPlanoAtual] =
    useState<(typeof PLAN_OPTIONS)[number]>(DEFAULT_PLAN);
  const [cartaoAtual, setCartaoAtual] =
    useState<(typeof PAYMENT_CARD_OPTIONS)[number]>(DEFAULT_PAYMENT_CARD);
  const [nomeAutomaticoConversas, setNomeAutomaticoConversas] = useState(true);
  const [fixarConversas, setFixarConversas] = useState(true);
  const [provedoresConectados, setProvedoresConectados] = useState<
    ConnectedProvider[]
  >(() => criarProvedoresConectadosPadrao());
  const [integracoesExternas, setIntegracoesExternas] = useState<
    ExternalIntegration[]
  >(() => criarIntegracoesExternasPadrao());
  const [sessoesAtivas, setSessoesAtivas] = useState<SessionDevice[]>(() =>
    criarSessoesAtivasPadrao(),
  );
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<
    (typeof TWO_FACTOR_METHOD_OPTIONS)[number]
  >(DEFAULT_TWO_FACTOR_METHOD);
  const [recoveryCodesEnabled, setRecoveryCodesEnabled] = useState(true);
  const [codigo2FA, setCodigo2FA] = useState("");
  const [codigosRecuperacao, setCodigosRecuperacao] = useState<string[]>([]);
  const [reautenticacaoStatus, setReautenticacaoStatus] = useState(
    DEFAULT_REAUTH_STATUS,
  );
  const [reautenticacaoExpiraEm, setReautenticacaoExpiraEm] = useState("");
  const [reauthReason, setReauthReason] = useState(DEFAULT_REAUTH_REASON);
  const [filtroEventosSeguranca, setFiltroEventosSeguranca] =
    useState<SecurityEventFilter>("todos");
  const [eventosSeguranca, setEventosSeguranca] = useState<SecurityEventItem[]>(
    () => criarEventosSegurancaPadrao(),
  );
  const [buscaAjuda, setBuscaAjuda] = useState("");
  const [artigoAjudaExpandidoId, setArtigoAjudaExpandidoId] = useState<string>(
    DEFAULT_HELP_ARTICLE_ID,
  );
  const [filaSuporteLocal, setFilaSuporteLocal] = useState<SupportQueueItem[]>(
    [],
  );
  const [ultimaVerificacaoAtualizacao, setUltimaVerificacaoAtualizacao] =
    useState("");
  const [statusAtualizacaoApp, setStatusAtualizacaoApp] = useState(
    DEFAULT_UPDATE_STATUS,
  );
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [bugDescriptionDraft, setBugDescriptionDraft] = useState("");
  const [bugEmailDraft, setBugEmailDraft] = useState("");
  const [bugAttachmentDraft, setBugAttachmentDraft] =
    useState<ComposerAttachment | null>(null);
  const [integracaoSincronizandoId, setIntegracaoSincronizandoId] = useState<
    ExternalIntegrationId | ""
  >("");

  function clearTransientSettingsPresentationState() {
    setBugAttachmentDraft(null);
    setIntegracaoSincronizandoId("");
  }

  function resetSessionBoundSettingsPresentationState() {
    clearTransientSettingsPresentationState();
    setSenhaAtualDraft("");
    setNovaSenhaDraft("");
    setConfirmarSenhaDraft("");
    setNomeCompletoDraft("");
    setNomeExibicaoDraft("");
    setTelefoneDraft("");
    setNovoEmailDraft("");
    setReautenticacaoExpiraEm("");
    setReautenticacaoStatus(DEFAULT_REAUTH_STATUS);
  }

  function resetSettingsPresentationAfterAccountDeletion() {
    resetSessionBoundSettingsPresentationState();
    setPlanoAtual(DEFAULT_PLAN);
    setCartaoAtual(DEFAULT_PAYMENT_CARD);
    setNomeAutomaticoConversas(true);
    setFixarConversas(true);
    setProvedoresConectados(criarProvedoresConectadosPadrao());
    setIntegracoesExternas(criarIntegracoesExternasPadrao());
    setSessoesAtivas(criarSessoesAtivasPadrao());
    setTwoFactorEnabled(false);
    setTwoFactorMethod(DEFAULT_TWO_FACTOR_METHOD);
    setRecoveryCodesEnabled(true);
    setCodigo2FA("");
    setCodigosRecuperacao([]);
    setFilaSuporteLocal([]);
    setEventosSeguranca([]);
    setFeedbackDraft("");
    setBugDescriptionDraft("");
    setBugEmailDraft("");
    setUltimaVerificacaoAtualizacao("");
    setStatusAtualizacaoApp(DEFAULT_UPDATE_STATUS);
    setBuscaAjuda("");
    setArtigoAjudaExpandidoId(DEFAULT_HELP_ARTICLE_ID);
  }

  return {
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
  };
}
