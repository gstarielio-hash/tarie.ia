import {
  ACCENT_OPTIONS,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  NOTIFICATION_SOUND_OPTIONS,
  THEME_OPTIONS,
} from "../InspectorMobileApp.constants";
import {
  SettingsPressRow,
  SettingsSection,
  SettingsSegmentedRow,
  SettingsSwitchRow,
} from "./SettingsPrimitives";

type TemaApp = (typeof THEME_OPTIONS)[number];
type TamanhoFonte = (typeof FONT_SIZE_OPTIONS)[number];
type DensidadeInterface = (typeof DENSITY_OPTIONS)[number];
type CorDestaque = (typeof ACCENT_OPTIONS)[number];
type SomNotificacao = (typeof NOTIFICATION_SOUND_OPTIONS)[number];

interface SettingsExperienceAppearanceSectionProps {
  temaApp: TemaApp;
  tamanhoFonte: TamanhoFonte;
  densidadeInterface: DensidadeInterface;
  corDestaque: CorDestaque;
  animacoesAtivas: boolean;
  onSetTemaApp: (value: TemaApp) => void;
  onSetTamanhoFonte: (value: TamanhoFonte) => void;
  onSetDensidadeInterface: (value: DensidadeInterface) => void;
  onSetCorDestaque: (value: CorDestaque) => void;
  onSetAnimacoesAtivas: (value: boolean) => void;
}

interface SettingsExperienceNotificationsSectionProps {
  notificaRespostas: boolean;
  notificaPush: boolean;
  notificacoesPermitidas: boolean;
  somNotificacao: SomNotificacao;
  vibracaoAtiva: boolean;
  emailsAtivos: boolean;
  chatCategoryEnabled: boolean;
  mesaCategoryEnabled: boolean;
  systemCategoryEnabled: boolean;
  criticalAlertsEnabled: boolean;
  onSetNotificaRespostas: (value: boolean) => void;
  onToggleNotificaPush: (value: boolean) => void;
  onSetSomNotificacao: (value: SomNotificacao) => void;
  onToggleVibracao: (value: boolean) => void;
  onSetEmailsAtivos: (value: boolean) => void;
  onSetChatCategoryEnabled: (value: boolean) => void;
  onSetMesaCategoryEnabled: (value: boolean) => void;
  onSetSystemCategoryEnabled: (value: boolean) => void;
  onSetCriticalAlertsEnabled: (value: boolean) => void;
  onAbrirPermissaoNotificacoes: () => void;
}

function nextOptionValue<T extends string>(
  current: T,
  options: readonly T[],
): T {
  const currentIndex = options.indexOf(current);
  if (currentIndex === -1) {
    return options[0];
  }
  return options[(currentIndex + 1) % options.length];
}

export function SettingsExperienceAppearanceSection({
  temaApp,
  tamanhoFonte,
  densidadeInterface,
  corDestaque,
  animacoesAtivas,
  onSetTemaApp,
  onSetTamanhoFonte,
  onSetDensidadeInterface,
  onSetCorDestaque,
  onSetAnimacoesAtivas,
}: SettingsExperienceAppearanceSectionProps) {
  return (
    <SettingsSection
      icon="palette-outline"
      subtitle="Visual, densidade e comportamento da interface."
      testID="settings-section-aparencia"
      title="Aparência"
    >
      <SettingsSegmentedRow
        icon="theme-light-dark"
        onChange={onSetTemaApp}
        options={THEME_OPTIONS}
        testID="settings-appearance-theme-row"
        title="Tema"
        value={temaApp}
      />
      <SettingsSegmentedRow
        icon="format-size"
        onChange={onSetTamanhoFonte}
        options={FONT_SIZE_OPTIONS}
        testID="settings-appearance-font-row"
        title="Tamanho da fonte"
        value={tamanhoFonte}
      />
      <SettingsSegmentedRow
        icon="view-compact-outline"
        onChange={onSetDensidadeInterface}
        options={DENSITY_OPTIONS}
        testID="settings-appearance-density-row"
        title="Densidade da interface"
        value={densidadeInterface}
      />
      <SettingsSegmentedRow
        description="Cor principal usada nos detalhes do app."
        icon="eyedropper-variant"
        onChange={onSetCorDestaque}
        options={ACCENT_OPTIONS}
        testID="settings-appearance-accent-row"
        title="Cor de destaque"
        value={corDestaque}
      />
      <SettingsSwitchRow
        icon="motion-outline"
        onValueChange={onSetAnimacoesAtivas}
        testID="settings-appearance-animations-row"
        title="Animações"
        value={animacoesAtivas}
      />
    </SettingsSection>
  );
}

export function SettingsExperienceNotificationsSection({
  notificaRespostas,
  notificaPush,
  notificacoesPermitidas,
  somNotificacao,
  vibracaoAtiva,
  emailsAtivos,
  chatCategoryEnabled,
  mesaCategoryEnabled,
  systemCategoryEnabled,
  criticalAlertsEnabled,
  onSetNotificaRespostas,
  onToggleNotificaPush,
  onSetSomNotificacao,
  onToggleVibracao,
  onSetEmailsAtivos,
  onSetChatCategoryEnabled,
  onSetMesaCategoryEnabled,
  onSetSystemCategoryEnabled,
  onSetCriticalAlertsEnabled,
  onAbrirPermissaoNotificacoes,
}: SettingsExperienceNotificationsSectionProps) {
  return (
    <SettingsSection
      icon="bell-outline"
      subtitle="Como o usuário recebe alertas e avisos do app."
      title="Notificações"
    >
      <SettingsSwitchRow
        icon="message-badge-outline"
        onValueChange={onSetNotificaRespostas}
        title="Notificações de respostas"
        value={notificaRespostas}
      />
      <SettingsSwitchRow
        icon="bell-badge-outline"
        onValueChange={onToggleNotificaPush}
        title="Notificações push"
        value={notificaPush}
      />
      <SettingsPressRow
        description="Mostra o estado real da permissão nativa do sistema."
        icon="cellphone-cog"
        onPress={onAbrirPermissaoNotificacoes}
        title="Permissão do sistema"
        value={notificacoesPermitidas ? "Permitida" : "Negada"}
      />
      <SettingsPressRow
        icon="music-note-outline"
        onPress={() =>
          onSetSomNotificacao(
            nextOptionValue(somNotificacao, NOTIFICATION_SOUND_OPTIONS),
          )
        }
        title="Som de notificação"
        value={somNotificacao}
      />
      <SettingsSwitchRow
        icon="vibrate"
        onValueChange={onToggleVibracao}
        title="Vibração"
        value={vibracaoAtiva}
      />
      <SettingsSwitchRow
        description="Novidades, atualizações e avisos por email."
        icon="email-fast-outline"
        onValueChange={onSetEmailsAtivos}
        title="Emails"
        value={emailsAtivos}
      />
      <SettingsSwitchRow
        icon="message-processing-outline"
        onValueChange={onSetChatCategoryEnabled}
        title="Categoria Chat"
        value={chatCategoryEnabled}
      />
      <SettingsSwitchRow
        icon="clipboard-text-outline"
        onValueChange={onSetMesaCategoryEnabled}
        title="Categoria Mesa"
        value={mesaCategoryEnabled}
      />
      <SettingsSwitchRow
        icon="cellphone-cog"
        onValueChange={onSetSystemCategoryEnabled}
        title="Categoria Sistema"
        value={systemCategoryEnabled}
      />
      <SettingsSwitchRow
        icon="alert-circle-outline"
        onValueChange={onSetCriticalAlertsEnabled}
        title="Alertas críticos"
        value={criticalAlertsEnabled}
      />
    </SettingsSection>
  );
}
