import { AI_MODEL_OPTIONS } from "../InspectorMobileApp.constants";
import { runExportDataFlow } from "./exportDataFlow";
import { handleConfirmSheetAction } from "./settingsConfirmActions";

type Setter = (...args: any[]) => void;

interface BuildSettingsConfirmAndExportActionsParams {
  abrirFluxoReautenticacao: (motivo: string, onSuccess?: () => void) => void;
  abrirSheetConfiguracao: (config: any) => void;
  compartilharMelhoriaIa: boolean;
  compartilharTextoExportado: (...args: any[]) => Promise<boolean>;
  confirmSheet: any;
  confirmTextDraft: string;
  densidadeInterface: any;
  economiaDados: boolean;
  email: string;
  emailAtualConta: string;
  emailsAtivos: boolean;
  estiloResposta: any;
  eventosSeguranca: any[];
  executarExclusaoContaLocal: () => Promise<void>;
  fecharConfirmacaoConfiguracao: () => void;
  fecharSheetConfiguracao: () => void;
  integracoesExternas: any[];
  idiomaResposta: any;
  laudosDisponiveis: any[];
  memoriaIa: boolean;
  modeloIa: any;
  notificacoes: any[];
  notificaPush: boolean;
  notificaRespostas: boolean;
  ocultarConteudoBloqueado: boolean;
  onCreateNewConversation: () => any;
  onIsValidAiModel: (value: unknown) => boolean;
  onRegistrarEventoSegurancaLocal: (evento: any) => void;
  onSetAnexoMesaRascunho: Setter;
  onSetAnexoRascunho: Setter;
  onSetBuscaHistorico: Setter;
  onSetCacheLeitura: (updater: (current: any) => any) => void;
  onSetConversa: Setter;
  onSetLaudosDisponiveis: Setter;
  onSetMensagem: Setter;
  onSetMensagemMesa: Setter;
  onSetMensagensMesa: Setter;
  onSetModeloIa: Setter;
  onSetNotificacoes: Setter;
  onSetPreviewAnexoImagem: Setter;
  perfilExibicao: string;
  perfilNome: string;
  planoAtual: any;
  reautenticacaoAindaValida: (value: string) => boolean;
  reautenticacaoExpiraEm: string;
  retencaoDados: string;
  salvarHistoricoConversas: boolean;
  serializarPayloadExportacao: (...args: any[]) => string;
  tamanhoFonte: any;
  temaApp: any;
  usoBateria: any;
  vibracaoAtiva: boolean;
  corDestaque: any;
  mostrarConteudoNotificacao: boolean;
  mostrarSomenteNovaMensagem: boolean;
  limparCachePorPrivacidade: (cache: any) => any;
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
