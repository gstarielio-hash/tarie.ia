import type { ComponentProps } from "react";

import { SettingsSection as FeatureSettingsSection } from "../../features/settings/SettingsPrimitives";

export type SettingsSectionProps = ComponentProps<
  typeof FeatureSettingsSection
>;

export function SettingsSection(props: SettingsSectionProps) {
  return <FeatureSettingsSection {...props} />;
}
