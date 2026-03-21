import type { PanResponderInstance } from "react-native";

import type { HelpArticleItem } from "./SettingsSheetBodyContent";
import type { SettingsDrawerPanelProps } from "./SettingsDrawerPanel";
import type { SupportQueueItem } from "./useSettingsPresentation";

type AccountSectionProps =
  SettingsDrawerPanelProps["accountSectionContentProps"];
type AdvancedResourcesSectionProps =
  SettingsDrawerPanelProps["advancedResourcesSectionProps"];
type ExperienceAiSectionProps =
  SettingsDrawerPanelProps["experienceAiSectionProps"];
type ExperienceAppearanceSectionProps =
  SettingsDrawerPanelProps["experienceAppearanceSectionProps"];
type ExperienceNotificationsSectionProps =
  SettingsDrawerPanelProps["experienceNotificationsSectionProps"];
type OverviewContentProps = SettingsDrawerPanelProps["overviewContentProps"];
type PriorityActionsContentProps =
  SettingsDrawerPanelProps["priorityActionsContentProps"];
type SectionMenuContentProps =
  SettingsDrawerPanelProps["sectionMenuContentProps"];
type SecurityActivitySectionProps =
  SettingsDrawerPanelProps["securityActivitySectionProps"];
type SecurityConnectedAccountsSectionProps =
  SettingsDrawerPanelProps["securityConnectedAccountsSectionProps"];
type SecurityDataConversationsSectionProps =
  SettingsDrawerPanelProps["securityDataConversationsSectionProps"];
type SecurityDeleteAccountSectionProps =
  SettingsDrawerPanelProps["securityDeleteAccountSectionProps"];
type SecurityDeviceProtectionSectionProps =
  SettingsDrawerPanelProps["securityDeviceProtectionSectionProps"];
type SecurityFileUploadSectionProps =
  SettingsDrawerPanelProps["securityFileUploadSectionProps"];
type SecurityIdentityVerificationSectionProps =
  SettingsDrawerPanelProps["securityIdentityVerificationSectionProps"];
type SecurityNotificationPrivacySectionProps =
  SettingsDrawerPanelProps["securityNotificationPrivacySectionProps"];
type SecurityPermissionsSectionProps =
  SettingsDrawerPanelProps["securityPermissionsSectionProps"];
type SecuritySessionsSectionProps =
  SettingsDrawerPanelProps["securitySessionsSectionProps"];
type SecurityTwoFactorSectionProps =
  SettingsDrawerPanelProps["securityTwoFactorSectionProps"];
type SupportSectionProps = SettingsDrawerPanelProps["supportSectionProps"];
type SystemSectionProps = SettingsDrawerPanelProps["systemSectionProps"];
type SupportSectionBaseProps = Omit<
  SupportSectionProps,
  "artigosAjudaCount" | "emailRetorno" | "filaSuporteCount"
>;
type SystemSectionBaseProps = Omit<
  SystemSectionProps,
  "appBuildChannel" | "appVersionLabel" | "onAbrirFilaOffline"
> &
  Partial<Pick<SystemSectionProps, "appBuildChannel" | "appVersionLabel">>;

export interface InspectorSettingsAccountSectionInput {
  accountSectionContentProps?: AccountSectionProps;
  contaEmailLabel: AccountSectionProps["contaEmailLabel"];
  contaTelefoneLabel: AccountSectionProps["contaTelefoneLabel"];
  handleAlterarEmail: AccountSectionProps["onAlterarEmail"];
  handleAlterarSenha: AccountSectionProps["onAlterarSenha"];
  handleEditarPerfil: AccountSectionProps["onEditarPerfil"];
  handleSolicitarLogout: AccountSectionProps["onSolicitarLogout"];
  handleUploadFotoPerfil: AccountSectionProps["onUploadFotoPerfil"];
  perfilExibicaoLabel: AccountSectionProps["perfilExibicaoLabel"];
  perfilFotoHint: AccountSectionProps["perfilFotoHint"];
  perfilFotoUri: AccountSectionProps["perfilFotoUri"];
  perfilNomeCompleto: AccountSectionProps["perfilNomeCompleto"];
  provedorPrimario: AccountSectionProps["provedorPrimario"];
  resumoContaAcesso: AccountSectionProps["resumoConta"];
  workspaceResumoConfiguracao: AccountSectionProps["workspaceAtual"];
}

export interface InspectorSettingsAdvancedResourcesSectionInput {
  advancedResourcesSectionProps?: AdvancedResourcesSectionProps;
  entradaPorVoz: AdvancedResourcesSectionProps["entradaPorVoz"];
  handleAbrirAjudaDitado: AdvancedResourcesSectionProps["onAbrirAjudaDitado"];
  handleAbrirAjustesDoSistema: (contexto: string) => void;
  handleToggleEntradaPorVoz: AdvancedResourcesSectionProps["onToggleEntradaPorVoz"];
  handleToggleRespostaPorVoz: AdvancedResourcesSectionProps["onToggleRespostaPorVoz"];
  handleToggleSpeechEnabled: AdvancedResourcesSectionProps["onToggleSpeechEnabled"];
  microfonePermitido: AdvancedResourcesSectionProps["microfonePermitido"];
  onCyclePreferredVoice: AdvancedResourcesSectionProps["onCyclePreferredVoice"];
  preferredVoiceLabel: AdvancedResourcesSectionProps["preferredVoiceLabel"];
  respostaPorVoz: AdvancedResourcesSectionProps["respostaPorVoz"];
  setSpeechRate: AdvancedResourcesSectionProps["onSetSpeechRate"];
  setVoiceLanguage: AdvancedResourcesSectionProps["onSetVoiceLanguage"];
  speechEnabled: AdvancedResourcesSectionProps["speechEnabled"];
  speechRate: AdvancedResourcesSectionProps["speechRate"];
  sttSupported: AdvancedResourcesSectionProps["sttSupported"];
  ttsSupported: AdvancedResourcesSectionProps["ttsSupported"];
  voiceLanguage: AdvancedResourcesSectionProps["voiceLanguage"];
}

export interface InspectorSettingsExperienceSectionInput {
  animacoesAtivas: ExperienceAppearanceSectionProps["animacoesAtivas"];
  aprendizadoIa: ExperienceAiSectionProps["aprendizadoIa"];
  chatCategoryEnabled: ExperienceNotificationsSectionProps["chatCategoryEnabled"];
  corDestaque: ExperienceAppearanceSectionProps["corDestaque"];
  criticalAlertsEnabled: ExperienceNotificationsSectionProps["criticalAlertsEnabled"];
  densidadeInterface: ExperienceAppearanceSectionProps["densidadeInterface"];
  emailsAtivos: ExperienceNotificationsSectionProps["emailsAtivos"];
  estiloResposta: ExperienceAiSectionProps["estiloResposta"];
  experienceNotificationsSectionProps?: ExperienceNotificationsSectionProps;
  handleAbrirModeloIa: ExperienceAiSectionProps["onAbrirMenuModeloIa"];
  handleToggleNotificaPush: ExperienceNotificationsSectionProps["onToggleNotificaPush"];
  handleToggleVibracao: ExperienceNotificationsSectionProps["onToggleVibracao"];
  idiomaResposta: ExperienceAiSectionProps["idiomaResposta"];
  memoriaIa: ExperienceAiSectionProps["memoriaIa"];
  mesaCategoryEnabled: ExperienceNotificationsSectionProps["mesaCategoryEnabled"];
  modeloIa: ExperienceAiSectionProps["modeloIa"];
  notificaPush: ExperienceNotificationsSectionProps["notificaPush"];
  notificaRespostas: ExperienceNotificationsSectionProps["notificaRespostas"];
  notificacoesPermitidas: ExperienceNotificationsSectionProps["notificacoesPermitidas"];
  onAbrirPermissaoNotificacoes: ExperienceNotificationsSectionProps["onAbrirPermissaoNotificacoes"];
  setAnimacoesAtivas: ExperienceAppearanceSectionProps["onSetAnimacoesAtivas"];
  setAprendizadoIa: ExperienceAiSectionProps["onSetAprendizadoIa"];
  setChatCategoryEnabled: ExperienceNotificationsSectionProps["onSetChatCategoryEnabled"];
  setCorDestaque: ExperienceAppearanceSectionProps["onSetCorDestaque"];
  setCriticalAlertsEnabled: ExperienceNotificationsSectionProps["onSetCriticalAlertsEnabled"];
  setDensidadeInterface: ExperienceAppearanceSectionProps["onSetDensidadeInterface"];
  setEmailsAtivos: ExperienceNotificationsSectionProps["onSetEmailsAtivos"];
  setEstiloResposta: ExperienceAiSectionProps["onSetEstiloResposta"];
  setIdiomaResposta: ExperienceAiSectionProps["onSetIdiomaResposta"];
  setMemoriaIa: ExperienceAiSectionProps["onSetMemoriaIa"];
  setMesaCategoryEnabled: ExperienceNotificationsSectionProps["onSetMesaCategoryEnabled"];
  setNotificaRespostas: ExperienceNotificationsSectionProps["onSetNotificaRespostas"];
  setSomNotificacao: ExperienceNotificationsSectionProps["onSetSomNotificacao"];
  setSystemCategoryEnabled: ExperienceNotificationsSectionProps["onSetSystemCategoryEnabled"];
  setTamanhoFonte: ExperienceAppearanceSectionProps["onSetTamanhoFonte"];
  setTemperaturaIa: ExperienceAiSectionProps["onSetTemperaturaIa"];
  setTemaApp: ExperienceAppearanceSectionProps["onSetTemaApp"];
  setTomConversa: ExperienceAiSectionProps["onSetTomConversa"];
  somNotificacao: ExperienceNotificationsSectionProps["somNotificacao"];
  systemCategoryEnabled: ExperienceNotificationsSectionProps["systemCategoryEnabled"];
  tamanhoFonte: ExperienceAppearanceSectionProps["tamanhoFonte"];
  temperaturaIa: ExperienceAiSectionProps["temperaturaIa"];
  temaApp: ExperienceAppearanceSectionProps["temaApp"];
  tomConversa: ExperienceAiSectionProps["tomConversa"];
  vibracaoAtiva: ExperienceNotificationsSectionProps["vibracaoAtiva"];
}

export interface InspectorSettingsOverviewSectionInput {
  contaEmailLabel: OverviewContentProps["contaEmailLabel"];
  contaTelefoneLabel: OverviewContentProps["contaTelefoneLabel"];
  corDestaqueResumoConfiguracao: OverviewContentProps["corDestaqueResumoConfiguracao"];
  fecharConfiguracoes: OverviewContentProps["onFecharConfiguracoes"];
  handleAbrirPaginaConfiguracoes: OverviewContentProps["onAbrirPaginaConfiguracoes"];
  handleAbrirSecaoConfiguracoes: SectionMenuContentProps["onAbrirSecaoConfiguracoes"];
  handleReportarProblema: OverviewContentProps["onReportarProblema"];
  handleRevisarPermissoesCriticas: PriorityActionsContentProps["onRevisarPermissoesCriticas"];
  handleSolicitarLogout: AccountSectionProps["onSolicitarLogout"];
  handleUploadFotoPerfil: OverviewContentProps["onUploadFotoPerfil"];
  handleVerificarAtualizacoes: PriorityActionsContentProps["onVerificarAtualizacoes"];
  iniciaisPerfilConfiguracao: OverviewContentProps["iniciaisPerfilConfiguracao"];
  nomeUsuarioExibicao: OverviewContentProps["nomeUsuarioExibicao"];
  perfilFotoUri: OverviewContentProps["perfilFotoUri"];
  permissoesNegadasTotal: PriorityActionsContentProps["permissoesNegadasTotal"];
  planoResumoConfiguracao: OverviewContentProps["planoResumoConfiguracao"];
  settingsPrintDarkMode: OverviewContentProps["settingsPrintDarkMode"];
  temPrioridadesConfiguracao: PriorityActionsContentProps["temPrioridadesConfiguracao"];
  temaResumoConfiguracao: OverviewContentProps["temaResumoConfiguracao"];
  ultimaVerificacaoAtualizacaoLabel: PriorityActionsContentProps["ultimaVerificacaoAtualizacaoLabel"];
  workspaceResumoConfiguracao: OverviewContentProps["workspaceResumoConfiguracao"];
}

export interface InspectorSettingsSecuritySectionInput {
  analyticsOptIn: SecurityDataConversationsSectionProps["analyticsOptIn"];
  arquivosPermitidos: SecurityPermissionsSectionProps["arquivosPermitidos"];
  autoUploadAttachments: SecurityDataConversationsSectionProps["autoUploadAttachments"];
  backupAutomatico: SecurityDataConversationsSectionProps["backupAutomatico"];
  biometriaPermitida: SecurityPermissionsSectionProps["biometriaPermitida"];
  cameraPermitida: SecurityPermissionsSectionProps["cameraPermitida"];
  codigo2FA: SecurityTwoFactorSectionProps["codigo2FA"];
  codigosRecuperacao: SecurityTwoFactorSectionProps["codigosRecuperacao"];
  compartilharMelhoriaIa: SecurityDataConversationsSectionProps["compartilharMelhoriaIa"];
  conversasOcultasTotal: SecurityDataConversationsSectionProps["conversasOcultasTotal"];
  conversasVisiveisTotal: SecurityDataConversationsSectionProps["conversasVisiveisTotal"];
  crashReportsOptIn: SecurityDataConversationsSectionProps["crashReportsOptIn"];
  deviceBiometricsEnabled: SecurityDeviceProtectionSectionProps["deviceBiometricsEnabled"];
  eventosSegurancaFiltrados: SecurityActivitySectionProps["eventosSegurancaFiltrados"];
  fecharConfiguracoes: () => void;
  filtroEventosSeguranca: SecurityActivitySectionProps["filtroEventosSeguranca"];
  fixarConversas: SecurityDataConversationsSectionProps["fixarConversas"];
  handleApagarHistoricoConfiguracoes: SecurityDataConversationsSectionProps["onApagarHistoricoConfiguracoes"];
  handleAbrirAjustesDoSistema: SecurityPermissionsSectionProps["onAbrirAjustesDoSistema"];
  handleCompartilharCodigosRecuperacao: SecurityTwoFactorSectionProps["onCompartilharCodigosRecuperacao"];
  handleConfirmarCodigo2FA: SecurityTwoFactorSectionProps["onConfirmarCodigo2FA"];
  handleDetalhesSegurancaArquivos: SecurityFileUploadSectionProps["onDetalhesSegurancaArquivos"];
  handleEncerrarOutrasSessoes: SecuritySessionsSectionProps["onEncerrarOutrasSessoes"];
  handleEncerrarSessao: SecuritySessionsSectionProps["onEncerrarSessao"];
  handleEncerrarSessaoAtual: SecuritySessionsSectionProps["onEncerrarSessaoAtual"];
  handleEncerrarSessoesSuspeitas: SecuritySessionsSectionProps["onEncerrarSessoesSuspeitas"];
  handleExcluirConta: SecurityDeleteAccountSectionProps["onExcluirConta"];
  handleExportarAntesDeExcluirConta: SecurityDeleteAccountSectionProps["onExportarAntesDeExcluirConta"];
  handleExportarDados: SecurityDataConversationsSectionProps["onExportarDados"];
  handleGerarCodigosRecuperacao: SecurityTwoFactorSectionProps["onGerarCodigosRecuperacao"];
  handleGerenciarConversasIndividuais: SecurityDataConversationsSectionProps["onGerenciarConversasIndividuais"];
  handleGerenciarPermissao: SecurityPermissionsSectionProps["onGerenciarPermissao"];
  handleLimparCache: SecurityDataConversationsSectionProps["onLimparCache"];
  handleLimparTodasConversasConfig: SecurityDataConversationsSectionProps["onLimparTodasConversasConfig"];
  handleLogout: SecuritySessionsSectionProps["onLogout"];
  handleMudarMetodo2FA: SecurityTwoFactorSectionProps["onMudarMetodo2FA"];
  handleReautenticacaoSensivel: SecurityIdentityVerificationSectionProps["onReautenticacaoSensivel"];
  handleReportarAtividadeSuspeita: SecurityActivitySectionProps["onReportarAtividadeSuspeita"];
  handleRevisarPermissoesCriticas: SecurityPermissionsSectionProps["onRevisarPermissoesCriticas"];
  handleRevisarSessao: SecuritySessionsSectionProps["onRevisarSessao"];
  handleToggle2FA: SecurityTwoFactorSectionProps["onToggle2FA"];
  handleToggleBackupAutomatico: SecurityDataConversationsSectionProps["onToggleBackupAutomatico"];
  handleToggleBiometriaNoDispositivo: SecurityDeviceProtectionSectionProps["onToggleBiometriaNoDispositivo"];
  handleToggleMostrarConteudoNotificacao: SecurityNotificationPrivacySectionProps["onToggleMostrarConteudoNotificacao"];
  handleToggleMostrarSomenteNovaMensagem: SecurityNotificationPrivacySectionProps["onToggleMostrarSomenteNovaMensagem"];
  handleToggleOcultarConteudoBloqueado: SecurityNotificationPrivacySectionProps["onToggleOcultarConteudoBloqueado"];
  handleToggleProviderConnection: SecurityConnectedAccountsSectionProps["onToggleProviderConnection"];
  handleToggleSincronizacaoDispositivos: SecurityDataConversationsSectionProps["onToggleSincronizacaoDispositivos"];
  hideInMultitask: SecurityDeviceProtectionSectionProps["hideInMultitask"];
  limpandoCache: SecurityDataConversationsSectionProps["limpandoCache"];
  lockTimeout: SecurityDeviceProtectionSectionProps["lockTimeout"];
  mediaCompression: SecurityDataConversationsSectionProps["mediaCompression"];
  microfonePermitido: SecurityPermissionsSectionProps["microfonePermitido"];
  mostrarConteudoNotificacao: SecurityNotificationPrivacySectionProps["mostrarConteudoNotificacao"];
  mostrarSomenteNovaMensagem: SecurityNotificationPrivacySectionProps["mostrarSomenteNovaMensagem"];
  nomeAutomaticoConversas: SecurityDataConversationsSectionProps["nomeAutomaticoConversas"];
  outrasSessoesAtivas: SecuritySessionsSectionProps["outrasSessoesAtivas"];
  ocultarConteudoBloqueado: SecurityNotificationPrivacySectionProps["ocultarConteudoBloqueado"];
  notificacoesPermitidas: SecurityPermissionsSectionProps["notificacoesPermitidas"];
  permissoesNegadasTotal: SecurityPermissionsSectionProps["permissoesNegadasTotal"];
  previewPrivacidadeNotificacao: SecurityNotificationPrivacySectionProps["previewPrivacidadeNotificacao"];
  provedoresConectados: SecurityConnectedAccountsSectionProps["provedoresConectados"];
  provedoresConectadosTotal: SecurityConnectedAccountsSectionProps["provedoresConectadosTotal"];
  provedorPrimario: SecurityConnectedAccountsSectionProps["provedorPrimario"];
  reautenticacaoStatus: SecurityIdentityVerificationSectionProps["reautenticacaoStatus"];
  recoveryCodesEnabled: SecurityTwoFactorSectionProps["recoveryCodesEnabled"];
  requireAuthOnOpen: SecurityDeviceProtectionSectionProps["requireAuthOnOpen"];
  resumo2FAFootnote: SecurityTwoFactorSectionProps["resumo2FAFootnote"];
  resumo2FAStatus: SecurityTwoFactorSectionProps["resumo2FAStatus"];
  resumoAlertaMetodosConta: SecurityConnectedAccountsSectionProps["resumoAlertaMetodosConta"];
  resumoBlindagemSessoes: SecuritySessionsSectionProps["resumoBlindagemSessoes"];
  resumoCache: SecurityDataConversationsSectionProps["cacheStatusLabel"];
  resumoCodigosRecuperacao: SecurityTwoFactorSectionProps["resumoCodigosRecuperacao"];
  resumoDadosConversas: SecurityDataConversationsSectionProps["resumoDadosConversas"];
  resumoExcluirConta: SecurityDeleteAccountSectionProps["resumoExcluirConta"];
  resumoPermissoes: SecurityPermissionsSectionProps["resumoPermissoes"];
  resumoPermissoesCriticas: SecurityPermissionsSectionProps["resumoPermissoesCriticas"];
  resumoPrivacidadeNotificacoes: SecurityNotificationPrivacySectionProps["resumoPrivacidadeNotificacoes"];
  resumoSessaoAtual: SecuritySessionsSectionProps["resumoSessaoAtual"];
  retencaoDados: SecurityDataConversationsSectionProps["retencaoDados"];
  salvarHistoricoConversas: SecurityDataConversationsSectionProps["salvarHistoricoConversas"];
  setAnalyticsOptIn: SecurityDataConversationsSectionProps["onSetAnalyticsOptIn"];
  setAutoUploadAttachments: SecurityDataConversationsSectionProps["onToggleAutoUploadAttachments"];
  setCodigo2FA: SecurityTwoFactorSectionProps["onSetCodigo2FA"];
  setCompartilharMelhoriaIa: SecurityDataConversationsSectionProps["onSetCompartilharMelhoriaIa"];
  setCrashReportsOptIn: SecurityDataConversationsSectionProps["onSetCrashReportsOptIn"];
  setFiltroEventosSeguranca: SecurityActivitySectionProps["onSetFiltroEventosSeguranca"];
  setFixarConversas: SecurityDataConversationsSectionProps["onSetFixarConversas"];
  setHideInMultitask: SecurityDeviceProtectionSectionProps["onSetHideInMultitask"];
  setLockTimeout: SecurityDeviceProtectionSectionProps["onSetLockTimeout"];
  setMediaCompression: SecurityDataConversationsSectionProps["onSetMediaCompression"];
  setNomeAutomaticoConversas: SecurityDataConversationsSectionProps["onSetNomeAutomaticoConversas"];
  setRecoveryCodesEnabled: SecurityTwoFactorSectionProps["onSetRecoveryCodesEnabled"];
  setRequireAuthOnOpen: SecurityDeviceProtectionSectionProps["onSetRequireAuthOnOpen"];
  setRetencaoDados: SecurityDataConversationsSectionProps["onSetRetencaoDados"];
  setSalvarHistoricoConversas: SecurityDataConversationsSectionProps["onSetSalvarHistoricoConversas"];
  setWifiOnlySync: SecurityDataConversationsSectionProps["onSetWifiOnlySync"];
  sessoesAtivas: SecuritySessionsSectionProps["sessoesAtivas"];
  sessoesSuspeitasTotal: SecuritySessionsSectionProps["sessoesSuspeitasTotal"];
  sincronizacaoDispositivos: SecurityDataConversationsSectionProps["sincronizacaoDispositivos"];
  twoFactorEnabled: SecurityTwoFactorSectionProps["twoFactorEnabled"];
  twoFactorMethod: SecurityTwoFactorSectionProps["twoFactorMethod"];
  ultimoEventoProvedor: SecurityConnectedAccountsSectionProps["ultimoEventoProvedor"];
  ultimoEventoSessao: SecuritySessionsSectionProps["ultimoEventoSessao"];
  wifiOnlySync: SecurityDataConversationsSectionProps["wifiOnlySync"];
}

export interface InspectorSettingsSupportAndSystemSectionInput {
  appBuildChannel?: SystemSectionBaseProps["appBuildChannel"];
  appVersionLabel?: SystemSectionBaseProps["appVersionLabel"];
  contaEmailLabel: OverviewContentProps["contaEmailLabel"];
  contaTelefoneLabel: OverviewContentProps["contaTelefoneLabel"];
  corDestaqueResumoConfiguracao: OverviewContentProps["corDestaqueResumoConfiguracao"];
  economiaDados: SystemSectionBaseProps["economiaDados"];
  fecharConfiguracoes: () => void;
  filaSuporteLocal: readonly SupportQueueItem[];
  handleAbrirCentralAtividade: SystemSectionBaseProps["onAbrirCentralAtividade"];
  handleAbrirCanalSuporte: NonNullable<
    SupportSectionBaseProps["onCanalSuporte"]
  >;
  handleAbrirSobreApp: SupportSectionBaseProps["onSobreApp"];
  handleCentralAjuda: SupportSectionBaseProps["onCentralAjuda"];
  handleEnviarFeedback: SupportSectionBaseProps["onEnviarFeedback"];
  handleExportarDiagnosticoApp: SupportSectionBaseProps["onExportarDiagnosticoApp"];
  handleLicencas: SupportSectionBaseProps["onLicencas"];
  handleLimparCache: SystemSectionBaseProps["onLimparCache"];
  handleLimparFilaSuporteLocal: SupportSectionBaseProps["onLimparFilaSuporteLocal"];
  handlePermissoes: SystemSectionBaseProps["onPermissoes"];
  handlePoliticaPrivacidade: SupportSectionBaseProps["onPoliticaPrivacidade"];
  handleRefresh: SystemSectionBaseProps["onRefreshData"];
  handleReportarProblema: SupportSectionBaseProps["onReportarProblema"];
  handleTermosUso: SupportSectionBaseProps["onTermosUso"];
  handleVerificarAtualizacoes: SystemSectionBaseProps["onVerificarAtualizacoes"];
  idiomaApp: SystemSectionBaseProps["idiomaApp"];
  regiaoApp: SystemSectionBaseProps["regiaoApp"];
  resumoCache: SystemSectionBaseProps["resumoCache"];
  resumoCentralAtividade: SystemSectionBaseProps["resumoCentralAtividade"];
  resumoFilaOffline: SystemSectionBaseProps["resumoFilaOffline"];
  resumoFilaSuporteLocal: SupportSectionBaseProps["resumoFilaSuporteLocal"];
  resumoPermissoes: SystemSectionBaseProps["resumoPermissoes"];
  resumoSuporteApp: SupportSectionBaseProps["resumoSuporteApp"];
  setEconomiaDados: SystemSectionBaseProps["onSetEconomiaDados"];
  setIdiomaApp: SystemSectionBaseProps["onSetIdiomaApp"];
  setRegiaoApp: SystemSectionBaseProps["onSetRegiaoApp"];
  setUsoBateria: SystemSectionBaseProps["onSetUsoBateria"];
  sincronizandoDados: SystemSectionBaseProps["sincronizandoDados"];
  supportChannelLabel: SupportSectionBaseProps["supportChannelLabel"];
  ticketsBugTotal: SupportSectionBaseProps["ticketsBugTotal"];
  ticketsFeedbackTotal: SupportSectionBaseProps["ticketsFeedbackTotal"];
  ultimaVerificacaoAtualizacaoLabel: SystemSectionBaseProps["ultimaVerificacaoAtualizacaoLabel"];
  ultimoTicketSuporteResumo: SupportSectionBaseProps["ultimoTicketSuporte"];
  usoBateria: SystemSectionBaseProps["usoBateria"];
  verificandoAtualizacoes: SystemSectionBaseProps["verificandoAtualizacoes"];
}

export interface InspectorSettingsDrawerPanelBuilderInput
  extends
    InspectorSettingsAccountSectionInput,
    InspectorSettingsAdvancedResourcesSectionInput,
    InspectorSettingsExperienceSectionInput,
    InspectorSettingsOverviewSectionInput,
    InspectorSettingsSecuritySectionInput,
    InspectorSettingsSupportAndSystemSectionInput {
  artigosAjudaFiltrados: readonly HelpArticleItem[];
  configuracoesDrawerX: SettingsDrawerPanelProps["configuracoesDrawerX"];
  email: string;
  emailAtualConta: string;
  handleVoltarResumoConfiguracoes: () => void;
  mostrarGrupoContaAcesso: SettingsDrawerPanelProps["mostrarGrupoContaAcesso"];
  mostrarGrupoExperiencia: SettingsDrawerPanelProps["mostrarGrupoExperiencia"];
  mostrarGrupoSeguranca: SettingsDrawerPanelProps["mostrarGrupoSeguranca"];
  mostrarGrupoSistema: SettingsDrawerPanelProps["mostrarGrupoSistema"];
  onAbrirFilaOffline: () => void;
  settingsDrawerInOverview: SettingsDrawerPanelProps["settingsDrawerInOverview"];
  settingsDrawerMatchesPage: SettingsDrawerPanelProps["settingsDrawerMatchesPage"];
  settingsDrawerMatchesSection: SettingsDrawerPanelProps["settingsDrawerMatchesSection"];
  settingsDrawerPage: SettingsDrawerPanelProps["settingsDrawerPage"];
  settingsDrawerPageSections: SettingsDrawerPanelProps["settingsDrawerPageSections"];
  settingsDrawerPanResponder: PanResponderInstance;
  settingsDrawerSectionMenuAtiva: SettingsDrawerPanelProps["settingsDrawerSectionMenuAtiva"];
  settingsDrawerSubtitle: SettingsDrawerPanelProps["settingsDrawerSubtitle"];
  settingsDrawerTitle: SettingsDrawerPanelProps["settingsDrawerTitle"];
  totalSecoesConfiguracaoVisiveis: SettingsDrawerPanelProps["totalSecoesConfiguracaoVisiveis"];
}

export interface SettingsDrawerPanelBuilderInput extends Omit<
  SettingsDrawerPanelProps,
  "onCloseOrBackPress" | "supportSectionProps" | "systemSectionProps"
> {
  appBuildChannel?: SystemSectionProps["appBuildChannel"];
  appVersionLabel?: SystemSectionProps["appVersionLabel"];
  artigosAjudaCount: number;
  emailRetorno: SupportSectionProps["emailRetorno"];
  fecharConfiguracoes: () => void;
  filaSuporteCount: number;
  handleVoltarResumoConfiguracoes: () => void;
  onAbrirFilaOffline: NonNullable<SystemSectionProps["onAbrirFilaOffline"]>;
  supportSectionProps: Omit<
    SupportSectionProps,
    "artigosAjudaCount" | "emailRetorno" | "filaSuporteCount"
  >;
  systemSectionProps: Omit<
    SystemSectionProps,
    "appBuildChannel" | "appVersionLabel" | "onAbrirFilaOffline"
  > &
    Partial<Pick<SystemSectionProps, "appBuildChannel" | "appVersionLabel">>;
}
