import { Platform } from "react-native";

import type { ApiHealthStatus } from "../../types/mobile";
import type { ComposerAttachment } from "../chat/types";
import type {
  ConnectedProvider,
  ExternalIntegration,
  SessionDevice,
  SupportQueueItem,
} from "./useSettingsPresentation";
import {
  renderSettingsSheetBodyContent,
  type HelpArticleItem,
} from "./SettingsSheetBodyContent";
import type { SettingsSheetState } from "./settingsSheetTypes";

interface BuildSettingsSheetBodyRendererParams {
  apiEnvironmentLabel: string;
  appBuildLabel: string;
  appName: string;
  artigoAjudaExpandidoId: string;
  artigosAjudaFiltrados: readonly HelpArticleItem[];
  bugAttachmentDraft: ComposerAttachment | null;
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
  handleAlternarIntegracaoExterna: (integration: ExternalIntegration) => void;
  handleRemoverScreenshotBug: () => void;
  handleSelecionarModeloIa: (
    value: "rápido" | "equilibrado" | "avançado",
  ) => void;
  handleSelecionarScreenshotBug: () => Promise<void>;
  handleSincronizarIntegracaoExterna: (
    integration: ExternalIntegration,
  ) => Promise<void>;
  handleToggleUploadArquivos: (value: boolean) => void;
  integracaoSincronizandoId: string;
  integracoesConectadasTotal: number;
  integracoesDisponiveisTotal: number;
  integracoesExternas: readonly ExternalIntegration[];
  modeloIa: "rápido" | "equilibrado" | "avançado";
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
  provedoresConectados: readonly ConnectedProvider[];
  reauthReason: string;
  reautenticacaoExpiraEm: string;
  resumoAtualizacaoApp: string;
  resumoFilaSuporteLocal: string;
  resumoSuporteApp: string;
  retencaoDados: string;
  salvarHistoricoConversas: boolean;
  senhaAtualDraft: string;
  sessaoAtual: SessionDevice | null;
  settingsSheet: SettingsSheetState | null;
  statusApi: ApiHealthStatus;
  statusAtualizacaoApp: string;
  supportChannelLabel: string;
  telefoneDraft: string;
  ultimaVerificacaoAtualizacaoLabel: string;
  ultimoTicketSuporte: SupportQueueItem | null;
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
