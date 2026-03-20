import { SettingsPressRow, SettingsSection } from "./SettingsPrimitives";
import {
  SETTINGS_DRAWER_PAGE_META,
  SETTINGS_DRAWER_SECTION_META,
  type SettingsDrawerPage,
  type SettingsSectionKey,
} from "./settingsNavigationMeta";

interface SettingsSectionMenuContentProps {
  settingsDrawerPage: SettingsDrawerPage;
  settingsDrawerPageSections: SettingsSectionKey[];
  onAbrirSecaoConfiguracoes: (section: SettingsSectionKey) => void;
}

export function SettingsSectionMenuContent({
  settingsDrawerPage,
  settingsDrawerPageSections,
  onAbrirSecaoConfiguracoes,
}: SettingsSectionMenuContentProps) {
  if (settingsDrawerPage === "overview") {
    return null;
  }

  return (
    <SettingsSection
      icon={SETTINGS_DRAWER_PAGE_META[settingsDrawerPage].icon}
      subtitle="Subconfigurações padronizadas para editar por categoria, sem rolagem longa."
      title="Seções"
    >
      {settingsDrawerPageSections.map((sectionKey) => {
        const meta = SETTINGS_DRAWER_SECTION_META[sectionKey];
        return (
          <SettingsPressRow
            key={sectionKey}
            description={meta.subtitle}
            icon={meta.icon}
            onPress={() => onAbrirSecaoConfiguracoes(sectionKey)}
            testID={`settings-section-link-${sectionKey}`}
            title={meta.title}
          />
        );
      })}
    </SettingsSection>
  );
}
