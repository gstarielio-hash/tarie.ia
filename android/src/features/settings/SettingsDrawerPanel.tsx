import type { ComponentProps } from "react";
import { Animated, ScrollView, Text, View, type GestureResponderHandlers } from "react-native";

import { styles } from "../InspectorMobileApp.styles";
import { SettingsAccountSectionContent } from "./SettingsAccountSectionContent";
import { SettingsDrawerHeader } from "./SettingsDrawerHeader";
import { SettingsExperienceAiSection } from "./SettingsExperienceAiSection";
import {
  SettingsExperienceAppearanceSection,
  SettingsExperienceNotificationsSection,
} from "./SettingsExperienceSections";
import { SettingsOverviewContent } from "./SettingsOverviewContent";
import { SettingsPriorityActionsContent } from "./SettingsPriorityActionsContent";
import { SettingsSectionLayoutProvider } from "./SettingsPrimitives";
import { SettingsSectionMenuContent } from "./SettingsSectionMenuContent";
import {
  SettingsSecurityConnectedAccountsSection,
  SettingsSecuritySessionsSection,
  SettingsSecurityTwoFactorSection,
} from "./SettingsSecurityCoreSections";
import {
  SettingsSecurityDataConversationsSection,
  SettingsSecurityDeleteAccountSection,
  SettingsSecurityFileUploadSection,
  SettingsSecurityNotificationPrivacySection,
  SettingsSecurityPermissionsSection,
} from "./SettingsSecurityDataPrivacySections";
import {
  SettingsSecurityActivitySection,
  SettingsSecurityDeviceProtectionSection,
  SettingsSecurityIdentityVerificationSection,
} from "./SettingsSecurityProtectionSections";
import {
  SettingsAdvancedResourcesSection,
  SettingsSupportSection,
  SettingsSystemSection,
} from "./SettingsSystemSupportSections";
import type { SettingsDrawerPage, SettingsSectionKey } from "./settingsNavigationMeta";

export interface SettingsDrawerPanelProps {
  settingsDrawerPanHandlers: GestureResponderHandlers;
  configuracoesDrawerX: Animated.Value;
  settingsDrawerInOverview: boolean;
  settingsPrintDarkMode: boolean;
  settingsDrawerTitle: string;
  settingsDrawerSubtitle: string;
  onCloseOrBackPress: () => void;
  settingsDrawerPage: SettingsDrawerPage;
  settingsDrawerPageSections: readonly SettingsSectionKey[];
  settingsDrawerSectionMenuAtiva: boolean;
  settingsDrawerMatchesPage: (page: Exclude<SettingsDrawerPage, "overview">) => boolean;
  settingsDrawerMatchesSection: (page: Exclude<SettingsDrawerPage, "overview">, section: SettingsSectionKey) => boolean;
  mostrarGrupoContaAcesso: boolean;
  mostrarGrupoExperiencia: boolean;
  mostrarGrupoSeguranca: boolean;
  mostrarGrupoSistema: boolean;
  totalSecoesConfiguracaoVisiveis: number;
  overviewContentProps: ComponentProps<typeof SettingsOverviewContent>;
  sectionMenuContentProps: Omit<
    ComponentProps<typeof SettingsSectionMenuContent>,
    "settingsDrawerPage" | "settingsDrawerPageSections"
  >;
  priorityActionsContentProps: ComponentProps<typeof SettingsPriorityActionsContent>;
  accountSectionContentProps: ComponentProps<typeof SettingsAccountSectionContent>;
  experienceAiSectionProps: ComponentProps<typeof SettingsExperienceAiSection>;
  experienceAppearanceSectionProps: ComponentProps<typeof SettingsExperienceAppearanceSection>;
  experienceNotificationsSectionProps: ComponentProps<typeof SettingsExperienceNotificationsSection>;
  securityConnectedAccountsSectionProps: ComponentProps<typeof SettingsSecurityConnectedAccountsSection>;
  securitySessionsSectionProps: ComponentProps<typeof SettingsSecuritySessionsSection>;
  securityTwoFactorSectionProps: ComponentProps<typeof SettingsSecurityTwoFactorSection>;
  securityDeviceProtectionSectionProps: ComponentProps<typeof SettingsSecurityDeviceProtectionSection>;
  securityIdentityVerificationSectionProps: ComponentProps<typeof SettingsSecurityIdentityVerificationSection>;
  securityActivitySectionProps: ComponentProps<typeof SettingsSecurityActivitySection>;
  securityDataConversationsSectionProps: ComponentProps<typeof SettingsSecurityDataConversationsSection>;
  securityPermissionsSectionProps: ComponentProps<typeof SettingsSecurityPermissionsSection>;
  securityFileUploadSectionProps: ComponentProps<typeof SettingsSecurityFileUploadSection>;
  securityNotificationPrivacySectionProps: ComponentProps<typeof SettingsSecurityNotificationPrivacySection>;
  securityDeleteAccountSectionProps: ComponentProps<typeof SettingsSecurityDeleteAccountSection>;
  advancedResourcesSectionProps: ComponentProps<typeof SettingsAdvancedResourcesSection>;
  systemSectionProps: ComponentProps<typeof SettingsSystemSection>;
  supportSectionProps: ComponentProps<typeof SettingsSupportSection>;
}

export function SettingsDrawerPanel({
  settingsDrawerPanHandlers,
  configuracoesDrawerX,
  settingsDrawerInOverview,
  settingsPrintDarkMode,
  settingsDrawerTitle,
  settingsDrawerSubtitle,
  onCloseOrBackPress,
  settingsDrawerPage,
  settingsDrawerPageSections,
  settingsDrawerSectionMenuAtiva,
  settingsDrawerMatchesPage,
  settingsDrawerMatchesSection,
  mostrarGrupoContaAcesso,
  mostrarGrupoExperiencia,
  mostrarGrupoSeguranca,
  mostrarGrupoSistema,
  totalSecoesConfiguracaoVisiveis,
  overviewContentProps,
  sectionMenuContentProps,
  priorityActionsContentProps,
  accountSectionContentProps,
  experienceAiSectionProps,
  experienceAppearanceSectionProps,
  experienceNotificationsSectionProps,
  securityConnectedAccountsSectionProps,
  securitySessionsSectionProps,
  securityTwoFactorSectionProps,
  securityDeviceProtectionSectionProps,
  securityIdentityVerificationSectionProps,
  securityActivitySectionProps,
  securityDataConversationsSectionProps,
  securityPermissionsSectionProps,
  securityFileUploadSectionProps,
  securityNotificationPrivacySectionProps,
  securityDeleteAccountSectionProps,
  advancedResourcesSectionProps,
  systemSectionProps,
  supportSectionProps,
}: SettingsDrawerPanelProps) {
  const hideInnerSectionHeaders = !settingsDrawerInOverview && !settingsDrawerSectionMenuAtiva;
  return (
    <Animated.View
      {...settingsDrawerPanHandlers}
      style={[
        styles.sidePanelDrawer,
        styles.sidePanelDrawerRight,
        settingsDrawerInOverview ? styles.sidePanelDrawerPrint : null,
        settingsDrawerInOverview && settingsPrintDarkMode ? styles.sidePanelDrawerPrintDark : null,
        { transform: [{ translateX: configuracoesDrawerX }] },
      ]}
      testID="settings-drawer"
    >
      <SettingsDrawerHeader
        onCloseOrBackPress={onCloseOrBackPress}
        settingsDrawerInOverview={settingsDrawerInOverview}
        settingsDrawerSubtitle={settingsDrawerSubtitle}
        settingsDrawerTitle={settingsDrawerTitle}
        settingsPrintDarkMode={settingsPrintDarkMode}
      />

      <ScrollView
        contentContainerStyle={styles.settingsDrawerContent}
        showsVerticalScrollIndicator={false}
      >
        <SettingsSectionLayoutProvider hideHeader={hideInnerSectionHeaders}>
          {settingsDrawerInOverview ? <SettingsOverviewContent {...overviewContentProps} /> : null}

          {!settingsDrawerInOverview && settingsDrawerSectionMenuAtiva ? (
            <SettingsSectionMenuContent
              {...sectionMenuContentProps}
              settingsDrawerPage={settingsDrawerPage}
              settingsDrawerPageSections={[...settingsDrawerPageSections]}
            />
          ) : null}

          {settingsDrawerMatchesSection("prioridades", "prioridades") ? (
            <SettingsPriorityActionsContent {...priorityActionsContentProps} />
          ) : null}

          {settingsDrawerMatchesSection("contaAcesso", "conta") ? (
            <SettingsAccountSectionContent {...accountSectionContentProps} />
          ) : null}

          {settingsDrawerMatchesSection("experiencia", "preferenciasIa") ? (
            <SettingsExperienceAiSection {...experienceAiSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("experiencia", "aparencia") ? (
            <SettingsExperienceAppearanceSection {...experienceAppearanceSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("experiencia", "notificacoes") ? (
            <SettingsExperienceNotificationsSection {...experienceNotificationsSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "contasConectadas") ? (
            <SettingsSecurityConnectedAccountsSection {...securityConnectedAccountsSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "sessoes") ? (
            <SettingsSecuritySessionsSection {...securitySessionsSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "twofa") ? (
            <SettingsSecurityTwoFactorSection {...securityTwoFactorSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "protecaoDispositivo") ? (
            <SettingsSecurityDeviceProtectionSection {...securityDeviceProtectionSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "verificacaoIdentidade") ? (
            <SettingsSecurityIdentityVerificationSection {...securityIdentityVerificationSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "atividadeSeguranca") ? (
            <SettingsSecurityActivitySection {...securityActivitySectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "dadosConversas") ? (
            <SettingsSecurityDataConversationsSection {...securityDataConversationsSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "permissoes") ? (
            <SettingsSecurityPermissionsSection {...securityPermissionsSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "segurancaArquivos") ? (
            <SettingsSecurityFileUploadSection {...securityFileUploadSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "privacidadeNotificacoes") ? (
            <SettingsSecurityNotificationPrivacySection {...securityNotificationPrivacySectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("seguranca", "excluirConta") ? (
            <SettingsSecurityDeleteAccountSection {...securityDeleteAccountSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("sistemaSuporte", "recursosAvancados") ? (
            <SettingsAdvancedResourcesSection {...advancedResourcesSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("sistemaSuporte", "sistema") ? (
            <SettingsSystemSection {...systemSectionProps} />
          ) : null}

          {settingsDrawerMatchesSection("sistemaSuporte", "suporte") ? (
            <SettingsSupportSection {...supportSectionProps} />
          ) : null}

          {!totalSecoesConfiguracaoVisiveis ? (
            <View style={styles.settingsInfoCard}>
              <Text style={styles.settingsInfoTitle}>Nenhuma seção encontrada</Text>
              <Text style={styles.settingsInfoText}>
                Ajuste a busca ou troque o filtro para localizar o bloco certo mais rápido.
              </Text>
            </View>
          ) : null}
        </SettingsSectionLayoutProvider>
      </ScrollView>
    </Animated.View>
  );
}
