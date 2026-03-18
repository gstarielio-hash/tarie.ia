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
  somNotificacao: SomNotificacao;
  vibracaoAtiva: boolean;
  emailsAtivos: boolean;
  onSetNotificaRespostas: (value: boolean) => void;
  onToggleNotificaPush: (value: boolean) => void;
  onSetSomNotificacao: (value: SomNotificacao) => void;
  onToggleVibracao: (value: boolean) => void;
  onSetEmailsAtivos: (value: boolean) => void;
}

function nextOptionValue<T extends string>(current: T, options: readonly T[]): T {
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
      title="Aparência"
    >
      <SettingsSegmentedRow
        icon="theme-light-dark"
        onChange={onSetTemaApp}
        options={THEME_OPTIONS}
        title="Tema"
        value={temaApp}
      />
      <SettingsSegmentedRow
        icon="format-size"
        onChange={onSetTamanhoFonte}
        options={FONT_SIZE_OPTIONS}
        title="Tamanho da fonte"
        value={tamanhoFonte}
      />
      <SettingsSegmentedRow
        icon="view-compact-outline"
        onChange={onSetDensidadeInterface}
        options={DENSITY_OPTIONS}
        title="Densidade da interface"
        value={densidadeInterface}
      />
      <SettingsSegmentedRow
        description="Cor principal usada nos detalhes do app."
        icon="eyedropper-variant"
        onChange={onSetCorDestaque}
        options={ACCENT_OPTIONS}
        title="Cor de destaque"
        value={corDestaque}
      />
      <SettingsSwitchRow
        icon="motion-outline"
        onValueChange={onSetAnimacoesAtivas}
        title="Animações"
        value={animacoesAtivas}
      />
    </SettingsSection>
  );
}

export function SettingsExperienceNotificationsSection({
  notificaRespostas,
  notificaPush,
  somNotificacao,
  vibracaoAtiva,
  emailsAtivos,
  onSetNotificaRespostas,
  onToggleNotificaPush,
  onSetSomNotificacao,
  onToggleVibracao,
  onSetEmailsAtivos,
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
        icon="music-note-outline"
        onPress={() => onSetSomNotificacao(nextOptionValue(somNotificacao, NOTIFICATION_SOUND_OPTIONS))}
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
    </SettingsSection>
  );
}
