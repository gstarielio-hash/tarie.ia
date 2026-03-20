import { Platform } from "react-native";

import { renderSettingsSheetBodyContent } from "./SettingsSheetBodyContent";

interface BuildSettingsSheetBodyRendererParams {
  apiEnvironmentLabel: string;
  appBuildLabel: string;
  appName: string;
  artigoAjudaExpandidoId: string;
  artigosAjudaFiltrados: readonly any[];
  bugAttachmentDraft: any;
  bugDescriptionDraft: string;
  bugEmailDraft: string;
  buscaAjuda: string;
  cartaoAtual: string;
  confirmarSenhaDraft: string;
  email: string;
  emailAtualConta: string;
  feedbackDraft: string;
  formatarHorarioAtividade: (value: string) => string;
  formatarStatusReautenticacao: (value: string) => string;
  handleAlternarArtigoAjuda: (articleId: string) => void;
  handleAlternarIntegracaoExterna: (integration: any) => void;
  handleRemoverScreenshotBug: () => void;
  handleSelecionarModeloIa: (value: any) => void;
  handleSelecionarScreenshotBug: () => Promise<void>;
  handleSincronizarIntegracaoExterna: (integration: any) => Promise<void>;
  handleToggleUploadArquivos: (value: boolean) => void;
  integracaoSincronizandoId: string;
  integracoesConectadasTotal: number;
  integracoesDisponiveisTotal: number;
  integracoesExternas: readonly any[];
  modeloIa: any;
  nomeAutomaticoConversas: boolean;
  nomeCompletoDraft: string;
  nomeExibicaoDraft: string;
  novaSenhaDraft: string;
  novoEmailDraft: string;
  onSetBugDescriptionDraft: (value: string) => void;
  onSetBugEmailDraft: (value: string) => void;
  onSetBuscaAjuda: (value: string) => void;
  onSetConfirmarSenhaDraft: (value: string) => void;
  onSetFeedbackDraft: (value: string) => void;
  onSetNomeAutomaticoConversas: (value: boolean) => void;
  onSetNomeCompletoDraft: (value: string) => void;
  onSetNomeExibicaoDraft: (value: string) => void;
  onSetNovaSenhaDraft: (value: string) => void;
  onSetNovoEmailDraft: (value: string) => void;
  onSetSenhaAtualDraft: (value: string) => void;
  onSetTelefoneDraft: (value: string) => void;
  perfilFotoHint: string;
  perfilFotoUri: string;
  planoAtual: string;
  provedoresConectados: readonly any[];
  reauthReason: string;
  reautenticacaoExpiraEm: string;
  resumoAtualizacaoApp: string;
  resumoFilaSuporteLocal: string;
  resumoSuporteApp: string;
  retencaoDados: string;
  salvarHistoricoConversas: boolean;
  senhaAtualDraft: string;
  sessaoAtual: any;
  settingsSheet: any;
  statusApi: string;
  statusAtualizacaoApp: string;
  supportChannelLabel: string;
  telefoneDraft: string;
  ultimaVerificacaoAtualizacaoLabel: string;
  ultimoTicketSuporte: any;
  uploadArquivosAtivo: boolean;
  workspaceLabel: string;
}

export function buildSettingsSheetBodyRenderer({
  apiEnvironmentLabel,
  appBuildLabel,
  appName,
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
  onSetBugDescriptionDraft,
  onSetBugEmailDraft,
  onSetBuscaAjuda,
  onSetConfirmarSenhaDraft,
  onSetFeedbackDraft,
  onSetNomeAutomaticoConversas,
  onSetNomeCompletoDraft,
  onSetNomeExibicaoDraft,
  onSetNovaSenhaDraft,
  onSetNovoEmailDraft,
  onSetSenhaAtualDraft,
  onSetTelefoneDraft,
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
  supportChannelLabel,
  telefoneDraft,
  ultimaVerificacaoAtualizacaoLabel,
  ultimoTicketSuporte,
  uploadArquivosAtivo,
  workspaceLabel,
}: BuildSettingsSheetBodyRendererParams) {
  return function renderSettingsSheetBody() {
    return renderSettingsSheetBodyContent({
      apiEnvironmentLabel,
      appBuildLabel,
      appName,
      appPlatformLabel: `${Platform.OS} ${String(Platform.Version || "").trim() || "n/d"}`,
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
      nomeCompletoDraft,
      nomeExibicaoDraft,
      nomeAutomaticoConversas,
      novaSenhaDraft,
      novoEmailDraft,
      onAlternarArtigoAjuda: handleAlternarArtigoAjuda,
      onBugDescriptionDraftChange: onSetBugDescriptionDraft,
      onBugEmailDraftChange: onSetBugEmailDraft,
      onBuscaAjudaChange: onSetBuscaAjuda,
      onConfirmarSenhaDraftChange: onSetConfirmarSenhaDraft,
      onFeedbackDraftChange: onSetFeedbackDraft,
      onNomeCompletoDraftChange: onSetNomeCompletoDraft,
      onNomeExibicaoDraftChange: onSetNomeExibicaoDraft,
      onNovaSenhaDraftChange: onSetNovaSenhaDraft,
      onNovoEmailDraftChange: onSetNovoEmailDraft,
      onRemoveScreenshot: handleRemoverScreenshotBug,
      onSelectScreenshot: () => {
        void handleSelecionarScreenshotBug();
      },
      onSenhaAtualDraftChange: onSetSenhaAtualDraft,
      onSyncNow: (item) => {
        void handleSincronizarIntegracaoExterna(item);
      },
      onTelefoneDraftChange: onSetTelefoneDraft,
      onToggleIntegracao: handleAlternarIntegracaoExterna,
      onToggleNomeAutomaticoConversas: onSetNomeAutomaticoConversas,
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
      supportChannelLabel,
      telefoneDraft,
      ultimaVerificacaoAtualizacaoLabel,
      ultimoTicketSuporte,
      uploadArquivosAtivo,
      workspaceLabel,
    });
  };
}
