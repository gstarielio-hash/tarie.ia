import type { Dispatch, SetStateAction } from "react";

import type { MobileLaudoCard, MobileMesaMessage } from "../../types/mobile";
import { AI_MODEL_OPTIONS } from "../InspectorMobileApp.constants";
import type {
  ChatState,
  ComposerAttachment,
  MobileActivityNotification,
} from "../chat/types";
import type { MobileReadCache } from "../common/readCacheTypes";
import type { AttachmentPreviewState } from "../common/inspectorUiBuilderTypes";
import { runExportDataFlow } from "./exportDataFlow";
import type {
  ConfirmSheetState,
  SettingsSheetState,
} from "./settingsSheetTypes";
import { handleConfirmSheetAction } from "./settingsConfirmActions";
import type { SettingsSecurityEventPayload } from "./settingsConfirmActions";
import type {
  ExternalIntegration,
  SecurityEventItem,
} from "./useSettingsPresentation";

interface BuildSettingsConfirmAndExportActionsParams {
  abrirFluxoReautenticacao: (motivo: string, onSuccess?: () => void) => void;
  abrirSheetConfiguracao: (config: SettingsSheetState) => void;
  compartilharMelhoriaIa: boolean;
  compartilharTextoExportado: (params: {
    extension: "json" | "txt";
    content: string;
    prefixo: string;
  }) => Promise<boolean>;
  confirmSheet: ConfirmSheetState | null;
  confirmTextDraft: string;
  densidadeInterface: string;
  economiaDados: boolean;
  email: string;
  emailAtualConta: string;
  emailsAtivos: boolean;
  estiloResposta: string;
  eventosSeguranca: SecurityEventItem[];
  executarExclusaoContaLocal: () => Promise<void>;
  fecharConfirmacaoConfiguracao: () => void;
  fecharSheetConfiguracao: () => void;
  integracoesExternas: ExternalIntegration[];
  idiomaResposta: string;
  laudosDisponiveis: MobileLaudoCard[];
  memoriaIa: boolean;
  modeloIa: (typeof AI_MODEL_OPTIONS)[number];
  notificacoes: MobileActivityNotification[];
  notificaPush: boolean;
  notificaRespostas: boolean;
  ocultarConteudoBloqueado: boolean;
  onCreateNewConversation: () => ChatState;
  onIsValidAiModel: (value: unknown) => boolean;
  onRegistrarEventoSegurancaLocal: (
    evento: SettingsSecurityEventPayload,
  ) => void;
  onSetAnexoMesaRascunho: Dispatch<SetStateAction<ComposerAttachment | null>>;
  onSetAnexoRascunho: Dispatch<SetStateAction<ComposerAttachment | null>>;
  onSetBuscaHistorico: Dispatch<SetStateAction<string>>;
  onSetCacheLeitura: Dispatch<SetStateAction<MobileReadCache>>;
  onSetConversa: Dispatch<SetStateAction<ChatState | null>>;
  onSetLaudosDisponiveis: Dispatch<SetStateAction<MobileLaudoCard[]>>;
  onSetMensagem: Dispatch<SetStateAction<string>>;
  onSetMensagemMesa: Dispatch<SetStateAction<string>>;
  onSetMensagensMesa: Dispatch<SetStateAction<MobileMesaMessage[]>>;
  onSetModeloIa: (value: (typeof AI_MODEL_OPTIONS)[number]) => void;
  onSetNotificacoes: Dispatch<SetStateAction<MobileActivityNotification[]>>;
  onSetPreviewAnexoImagem: Dispatch<
    SetStateAction<AttachmentPreviewState | null>
  >;
  perfilExibicao: string;
  perfilNome: string;
  planoAtual: string;
  reautenticacaoAindaValida: (value: string) => boolean;
  reautenticacaoExpiraEm: string;
  retencaoDados: string;
  salvarHistoricoConversas: boolean;
  serializarPayloadExportacao: (payload: unknown) => string;
  tamanhoFonte: string;
  temaApp: string;
  usoBateria: string;
  vibracaoAtiva: boolean;
  corDestaque: string;
  mostrarConteudoNotificacao: boolean;
  mostrarSomenteNovaMensagem: boolean;
  limparCachePorPrivacidade: (cache: MobileReadCache) => MobileReadCache;
}

export function buildSettingsConfirmAndExportActions({
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
  onCreateNewConversation,
  onIsValidAiModel,
  onRegistrarEventoSegurancaLocal,
  onSetAnexoMesaRascunho,
  onSetAnexoRascunho,
  onSetBuscaHistorico,
  onSetCacheLeitura,
  onSetConversa,
  onSetLaudosDisponiveis,
  onSetMensagem,
  onSetMensagemMesa,
  onSetMensagensMesa,
  onSetModeloIa,
  onSetNotificacoes,
  onSetPreviewAnexoImagem,
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
}: BuildSettingsConfirmAndExportActionsParams) {
  function executarLimpezaHistoricoLocal() {
    onSetConversa(onCreateNewConversation());
    onSetMensagensMesa([]);
    onSetMensagem("");
    onSetMensagemMesa("");
    onSetAnexoRascunho(null);
    onSetAnexoMesaRascunho(null);
    onSetPreviewAnexoImagem(null);
    onSetBuscaHistorico("");
    onSetCacheLeitura((estadoAtual) => limparCachePorPrivacidade(estadoAtual));
  }

  function executarLimpezaConversasLocais() {
    onSetLaudosDisponiveis([]);
    onSetConversa(onCreateNewConversation());
    onSetMensagensMesa([]);
    onSetMensagem("");
    onSetMensagemMesa("");
    onSetAnexoRascunho(null);
    onSetAnexoMesaRascunho(null);
    onSetPreviewAnexoImagem(null);
    onSetBuscaHistorico("");
    onSetNotificacoes([]);
    onSetCacheLeitura((estadoAtual) => limparCachePorPrivacidade(estadoAtual));
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
      onRegistrarEventoSegurancaLocal,
    });
  }

  function handleSelecionarModeloIa(value: (typeof AI_MODEL_OPTIONS)[number]) {
    if (!onIsValidAiModel(value)) {
      return;
    }
    onSetModeloIa(value);
    fecharSheetConfiguracao();
  }

  async function handleExportarDados(formato: "JSON" | "PDF" | "TXT") {
    await runExportDataFlow({
      formato,
      reautenticacaoExpiraEm,
      reautenticacaoAindaValida,
      abrirFluxoReautenticacao,
      registrarEventoSegurancaLocal: onRegistrarEventoSegurancaLocal,
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
      aprendizadoIa: compartilharMelhoriaIa,
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

  return {
    handleConfirmarAcaoCritica,
    handleExportarDados,
    handleSelecionarModeloIa,
  };
}
