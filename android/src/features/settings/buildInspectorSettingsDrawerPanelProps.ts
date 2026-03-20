import { buildSettingsDrawerPanelProps } from "./buildSettingsDrawerPanelProps";
import {
  buildInspectorAccountSectionContentProps,
  buildInspectorAdvancedResourcesSectionProps,
  buildInspectorExperienceSectionProps,
  buildInspectorOverviewSectionProps,
  buildInspectorSecuritySectionProps,
  buildInspectorSupportAndSystemSectionProps,
} from "./buildInspectorSettingsDrawerSections";

type BuildInspectorSettingsDrawerPanelPropsInput = Record<string, any>;

export function buildInspectorSettingsDrawerPanelProps(
  input: BuildInspectorSettingsDrawerPanelPropsInput,
): ReturnType<typeof buildSettingsDrawerPanelProps> {
  const experienceSectionProps = buildInspectorExperienceSectionProps(input);
  const overviewSectionProps = buildInspectorOverviewSectionProps(input);
  const securitySectionProps = buildInspectorSecuritySectionProps(input);
  const supportAndSystemSectionProps =
    buildInspectorSupportAndSystemSectionProps(input);

  return buildSettingsDrawerPanelProps({
    accountSectionContentProps: buildInspectorAccountSectionContentProps(input),
    advancedResourcesSectionProps:
      buildInspectorAdvancedResourcesSectionProps(input),
    artigosAjudaCount: input.artigosAjudaFiltrados.length,
    configuracoesDrawerX: input.configuracoesDrawerX,
    emailRetorno:
      input.emailAtualConta || input.email || "Defina um email na conta",
    experienceAiSectionProps: experienceSectionProps.experienceAiSectionProps,
    experienceAppearanceSectionProps:
      experienceSectionProps.experienceAppearanceSectionProps,
    experienceNotificationsSectionProps:
      experienceSectionProps.experienceNotificationsSectionProps,
    fecharConfiguracoes: input.fecharConfiguracoes,
    filaSuporteCount: input.filaSuporteLocal.length,
    handleVoltarResumoConfiguracoes: input.handleVoltarResumoConfiguracoes,
    mostrarGrupoContaAcesso: input.mostrarGrupoContaAcesso,
    mostrarGrupoExperiencia: input.mostrarGrupoExperiencia,
    mostrarGrupoSeguranca: input.mostrarGrupoSeguranca,
    mostrarGrupoSistema: input.mostrarGrupoSistema,
    onAbrirFilaOffline: input.onAbrirFilaOffline,
    overviewContentProps: overviewSectionProps.overviewContentProps,
    priorityActionsContentProps:
      overviewSectionProps.priorityActionsContentProps,
    sectionMenuContentProps: overviewSectionProps.sectionMenuContentProps,
    securityActivitySectionProps:
      securitySectionProps.securityActivitySectionProps,
    securityConnectedAccountsSectionProps:
      securitySectionProps.securityConnectedAccountsSectionProps,
    securityDataConversationsSectionProps:
      securitySectionProps.securityDataConversationsSectionProps,
    securityDeleteAccountSectionProps:
      securitySectionProps.securityDeleteAccountSectionProps,
    securityDeviceProtectionSectionProps:
      securitySectionProps.securityDeviceProtectionSectionProps,
    securityFileUploadSectionProps:
      securitySectionProps.securityFileUploadSectionProps,
    securityIdentityVerificationSectionProps:
      securitySectionProps.securityIdentityVerificationSectionProps,
    securityNotificationPrivacySectionProps:
      securitySectionProps.securityNotificationPrivacySectionProps,
    securityPermissionsSectionProps:
      securitySectionProps.securityPermissionsSectionProps,
    securitySessionsSectionProps:
      securitySectionProps.securitySessionsSectionProps,
    securityTwoFactorSectionProps:
      securitySectionProps.securityTwoFactorSectionProps,
    settingsDrawerInOverview: input.settingsDrawerInOverview,
    settingsDrawerMatchesPage: input.settingsDrawerMatchesPage,
    settingsDrawerMatchesSection: input.settingsDrawerMatchesSection,
    settingsDrawerPage: input.settingsDrawerPage,
    settingsDrawerPageSections: input.settingsDrawerPageSections,
    settingsDrawerPanHandlers: input.settingsDrawerPanResponder.panHandlers,
    settingsDrawerSectionMenuAtiva: input.settingsDrawerSectionMenuAtiva,
    settingsDrawerSubtitle: input.settingsDrawerSubtitle,
    settingsDrawerTitle: input.settingsDrawerTitle,
    settingsPrintDarkMode: input.settingsPrintDarkMode,
    supportSectionProps: supportAndSystemSectionProps.supportSectionProps,
    systemSectionProps: supportAndSystemSectionProps.systemSectionProps,
    totalSecoesConfiguracaoVisiveis: input.totalSecoesConfiguracaoVisiveis,
  });
}
