import {
  AI_MODEL_OPTIONS,
  APP_BUILD_CHANNEL,
  APP_VERSION_LABEL,
  LICENSES_CATALOG,
  TARIEL_APP_MARK,
  TERMS_OF_USE_SECTIONS,
  UPDATE_CHANGELOG,
} from "../InspectorMobileApp.constants";
import {
  SettingsBillingSheetContent,
  SettingsEmailSheetContent,
  SettingsIntegrationsSheetContent,
  SettingsPasswordSheetContent,
  SettingsPaymentsSheetContent,
  SettingsPhotoSheetContent,
  SettingsPlanSheetContent,
  SettingsPluginsSheetContent,
  SettingsProfileSheetContent,
  SettingsReauthSheetContent,
} from "./SettingsSheetAccountContent";
import { SettingsAiModelSheetContent } from "./SettingsSheetExperienceContent";
import {
  SettingsBugSheetContent,
  SettingsFeedbackSheetContent,
  SettingsHelpSheetContent,
} from "./SettingsSheetSupportContent";
import { renderStaticSettingsSheetBody } from "./SettingsSheetStaticContent";
import type { ExternalIntegrationCardModel } from "./IntegrationConnectionCard";
import type { SettingsSheetState } from "./settingsSheetTypes";

interface ConnectedProviderSummary {
  label: string;
  connected: boolean;
}

interface SessionDeviceSummary {
  title: string;
}

interface SupportQueueSnapshotItem {
  kind: "bug" | "feedback";
  body: string;
  status: string;
  createdAt: string;
  attachmentLabel?: string;
}

type BugAttachmentDraft =
  | {
      kind: "image";
      previewUri: string;
      label: string;
      resumo: string;
    }
  | {
      kind: "document";
      nomeDocumento: string;
    }
  | null;

interface HelpArticleItem {
  id: string;
  title: string;
  category: string;
  estimatedRead: string;
  summary: string;
  body: string;
}

interface SettingsSheetBodyContentParams<
  TIntegration extends ExternalIntegrationCardModel,
> {
  settingsSheet: SettingsSheetState | null;
  appName: string;
  appBuildLabel: string;
  appPlatformLabel: string;
  apiEnvironmentLabel: string;
  supportChannelLabel: string;
  modeloIa: (typeof AI_MODEL_OPTIONS)[number];
  salvarHistoricoConversas: boolean;
  retencaoDados: string;
  ultimaVerificacaoAtualizacaoLabel: string;
  statusAtualizacaoApp: string;
  resumoAtualizacaoApp: string;
  formatarStatusReautenticacao: (value: string) => string;
  reauthReason: string;
  reautenticacaoExpiraEm: string;
  provedoresConectados: readonly ConnectedProviderSummary[];
  workspaceLabel: string;
  perfilFotoHint: string;
  perfilFotoUri: string;
  nomeCompletoDraft: string;
  nomeExibicaoDraft: string;
  telefoneDraft: string;
  onNomeCompletoDraftChange: (value: string) => void;
  onNomeExibicaoDraftChange: (value: string) => void;
  onTelefoneDraftChange: (value: string) => void;
  planoAtual: string;
  cartaoAtual: string;
  emailAtualConta: string;
  email: string;
  novoEmailDraft: string;
  onNovoEmailDraftChange: (value: string) => void;
  senhaAtualDraft: string;
  novaSenhaDraft: string;
  confirmarSenhaDraft: string;
  onSenhaAtualDraftChange: (value: string) => void;
  onNovaSenhaDraftChange: (value: string) => void;
  onConfirmarSenhaDraftChange: (value: string) => void;
  buscaAjuda: string;
  onBuscaAjudaChange: (value: string) => void;
  resumoSuporteApp: string;
  resumoFilaSuporteLocal: string;
  ultimoTicketSuporte: SupportQueueSnapshotItem | null;
  artigosAjudaFiltrados: readonly HelpArticleItem[];
  artigoAjudaExpandidoId: string;
  onAlternarArtigoAjuda: (articleId: string) => void;
  formatarHorarioAtividade: (iso: string) => string;
  bugAttachmentDraft: BugAttachmentDraft;
  bugDescriptionDraft: string;
  bugEmailDraft: string;
  onBugDescriptionDraftChange: (value: string) => void;
  onBugEmailDraftChange: (value: string) => void;
  onRemoveScreenshot: () => void;
  onSelectScreenshot: () => void;
  sessaoAtual: SessionDeviceSummary | null;
  statusApi: string;
  feedbackDraft: string;
  onFeedbackDraftChange: (value: string) => void;
  integracaoSincronizandoId: string;
  integracoesConectadasTotal: number;
  integracoesDisponiveisTotal: number;
  integracoesExternas: readonly TIntegration[];
  onSyncNow: (integration: TIntegration) => void;
  onToggleIntegracao: (integration: TIntegration) => void;
  nomeAutomaticoConversas: boolean;
  onToggleNomeAutomaticoConversas: (value: boolean) => void;
  onToggleUploadArquivos: (value: boolean) => void;
  uploadArquivosAtivo: boolean;
  onSelecionarModeloIa: (value: (typeof AI_MODEL_OPTIONS)[number]) => void;
}

export function renderSettingsSheetBodyContent<
  TIntegration extends ExternalIntegrationCardModel,
>({
  settingsSheet,
  appName,
  appBuildLabel,
  appPlatformLabel,
  apiEnvironmentLabel,
  supportChannelLabel,
  modeloIa,
  salvarHistoricoConversas,
  retencaoDados,
  ultimaVerificacaoAtualizacaoLabel,
  statusAtualizacaoApp,
  resumoAtualizacaoApp,
  formatarStatusReautenticacao,
  reauthReason,
  reautenticacaoExpiraEm,
  provedoresConectados,
  workspaceLabel,
  perfilFotoHint,
  perfilFotoUri,
  nomeCompletoDraft,
  nomeExibicaoDraft,
  telefoneDraft,
  onNomeCompletoDraftChange,
  onNomeExibicaoDraftChange,
  onTelefoneDraftChange,
  planoAtual,
  cartaoAtual,
  emailAtualConta,
  email,
  novoEmailDraft,
  onNovoEmailDraftChange,
  senhaAtualDraft,
  novaSenhaDraft,
  confirmarSenhaDraft,
  onSenhaAtualDraftChange,
  onNovaSenhaDraftChange,
  onConfirmarSenhaDraftChange,
  buscaAjuda,
  onBuscaAjudaChange,
  resumoSuporteApp,
  resumoFilaSuporteLocal,
  ultimoTicketSuporte,
  artigosAjudaFiltrados,
  artigoAjudaExpandidoId,
  onAlternarArtigoAjuda,
  formatarHorarioAtividade,
  bugAttachmentDraft,
  bugDescriptionDraft,
  bugEmailDraft,
  onBugDescriptionDraftChange,
  onBugEmailDraftChange,
  onRemoveScreenshot,
  onSelectScreenshot,
  sessaoAtual,
  statusApi,
  feedbackDraft,
  onFeedbackDraftChange,
  integracaoSincronizandoId,
  integracoesConectadasTotal,
  integracoesDisponiveisTotal,
  integracoesExternas,
  onSyncNow,
  onToggleIntegracao,
  nomeAutomaticoConversas,
  onToggleNomeAutomaticoConversas,
  onToggleUploadArquivos,
  uploadArquivosAtivo,
  onSelecionarModeloIa,
}: SettingsSheetBodyContentParams<TIntegration>) {
  if (!settingsSheet) {
    return null;
  }

  const staticSheetContent = renderStaticSettingsSheetBody({
    kind: settingsSheet.kind,
    title: settingsSheet.title,
    appName,
    salvarHistoricoConversas,
    retencaoDados,
    appVersionLabel: APP_VERSION_LABEL,
    appBuildLabel,
    appBuildChannel: APP_BUILD_CHANNEL,
    appPlatformLabel,
    apiEnvironmentLabel,
    workspaceLabel,
    supportChannelLabel,
    ultimaVerificacaoAtualizacaoLabel,
    statusAtualizacaoApp,
    resumoAtualizacaoApp,
    updateChangelog: UPDATE_CHANGELOG,
    termsSections: TERMS_OF_USE_SECTIONS,
    licensesCatalog: LICENSES_CATALOG,
  });
  if (staticSheetContent) {
    return staticSheetContent;
  }

  switch (settingsSheet.kind) {
    case "profile":
      return (
        <SettingsProfileSheetContent
          nomeCompletoDraft={nomeCompletoDraft}
          nomeExibicaoDraft={nomeExibicaoDraft}
          onNomeCompletoChange={onNomeCompletoDraftChange}
          onNomeExibicaoChange={onNomeExibicaoDraftChange}
          onTelefoneChange={onTelefoneDraftChange}
          telefoneDraft={telefoneDraft}
        />
      );
    case "aiModel":
      return (
        <SettingsAiModelSheetContent
          modeloIa={modeloIa}
          onSelecionarModeloIa={onSelecionarModeloIa}
        />
      );
    case "reauth":
      return (
        <SettingsReauthSheetContent
          brandMarkSource={TARIEL_APP_MARK}
          formatarStatusReautenticacao={formatarStatusReautenticacao}
          reauthReason={reauthReason}
          reautenticacaoExpiraEm={reautenticacaoExpiraEm}
          provedoresConectados={provedoresConectados}
        />
      );
    case "photo":
      return (
        <SettingsPhotoSheetContent
          perfilFotoHint={perfilFotoHint}
          photoSource={perfilFotoUri ? { uri: perfilFotoUri } : TARIEL_APP_MARK}
        />
      );
    case "plan":
      return <SettingsPlanSheetContent planoAtual={planoAtual} />;
    case "billing":
      return <SettingsBillingSheetContent cartaoAtual={cartaoAtual} />;
    case "email":
      return (
        <SettingsEmailSheetContent
          emailAtualConta={emailAtualConta}
          emailLogin={email}
          novoEmailDraft={novoEmailDraft}
          onNovoEmailChange={onNovoEmailDraftChange}
        />
      );
    case "password":
      return (
        <SettingsPasswordSheetContent
          confirmarSenhaDraft={confirmarSenhaDraft}
          novaSenhaDraft={novaSenhaDraft}
          onConfirmarSenhaChange={onConfirmarSenhaDraftChange}
          onNovaSenhaChange={onNovaSenhaDraftChange}
          onSenhaAtualChange={onSenhaAtualDraftChange}
          senhaAtualDraft={senhaAtualDraft}
        />
      );
    case "payments":
      return <SettingsPaymentsSheetContent />;
    case "help":
      return (
        <SettingsHelpSheetContent
          artigoAjudaExpandidoId={artigoAjudaExpandidoId}
          artigosAjudaFiltrados={artigosAjudaFiltrados}
          buscaAjuda={buscaAjuda}
          emailAtualConta={emailAtualConta}
          emailLogin={email}
          formatarHorarioAtividade={formatarHorarioAtividade}
          onAlternarArtigoAjuda={onAlternarArtigoAjuda}
          onBuscaAjudaChange={onBuscaAjudaChange}
          resumoAtualizacaoApp={resumoAtualizacaoApp}
          resumoFilaSuporteLocal={resumoFilaSuporteLocal}
          resumoSuporteApp={resumoSuporteApp}
          ultimoTicketSuporte={ultimoTicketSuporte}
        />
      );
    case "bug":
      return (
        <SettingsBugSheetContent
          bugAttachmentDraft={bugAttachmentDraft}
          bugDescriptionDraft={bugDescriptionDraft}
          bugEmailDraft={bugEmailDraft}
          formatarHorarioAtividade={formatarHorarioAtividade}
          onBugDescriptionDraftChange={onBugDescriptionDraftChange}
          onBugEmailDraftChange={onBugEmailDraftChange}
          onRemoveScreenshot={onRemoveScreenshot}
          onSelectScreenshot={onSelectScreenshot}
          resumoFilaSuporteLocal={resumoFilaSuporteLocal}
          resumoSuporteApp={resumoSuporteApp}
          sessaoAtual={sessaoAtual}
          statusApi={statusApi}
          ultimoTicketSuporte={ultimoTicketSuporte}
        />
      );
    case "feedback":
      return (
        <SettingsFeedbackSheetContent
          feedbackDraft={feedbackDraft}
          formatarHorarioAtividade={formatarHorarioAtividade}
          onFeedbackDraftChange={onFeedbackDraftChange}
          resumoFilaSuporteLocal={resumoFilaSuporteLocal}
          ultimoTicketSuporte={ultimoTicketSuporte}
        />
      );
    case "integrations":
      return (
        <SettingsIntegrationsSheetContent
          formatarHorarioAtividade={formatarHorarioAtividade}
          integracaoSincronizandoId={integracaoSincronizandoId}
          integracoesConectadasTotal={integracoesConectadasTotal}
          integracoesDisponiveisTotal={integracoesDisponiveisTotal}
          integracoesExternas={integracoesExternas}
          onSyncNow={onSyncNow}
          onToggle={onToggleIntegracao}
        />
      );
    case "plugins":
      return (
        <SettingsPluginsSheetContent
          nomeAutomaticoConversas={nomeAutomaticoConversas}
          onToggleNomeAutomaticoConversas={onToggleNomeAutomaticoConversas}
          onToggleUploadArquivos={onToggleUploadArquivos}
          uploadArquivosAtivo={uploadArquivosAtivo}
        />
      );
  }
}
