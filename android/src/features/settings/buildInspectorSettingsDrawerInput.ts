interface BuildInspectorSettingsDrawerInputParams<
  TAccount extends object,
  TExperience extends object,
  TNavigation extends object,
  TSecurity extends object,
  TSupportAndSystem extends object,
> {
  account: TAccount;
  experience: TExperience;
  navigation: TNavigation;
  security: TSecurity;
  supportAndSystem: TSupportAndSystem;
}

export function buildInspectorSettingsDrawerInput<
  TAccount extends object,
  TExperience extends object,
  TNavigation extends object,
  TSecurity extends object,
  TSupportAndSystem extends object,
>({
  account,
  experience,
  navigation,
  security,
  supportAndSystem,
}: BuildInspectorSettingsDrawerInputParams<
  TAccount,
  TExperience,
  TNavigation,
  TSecurity,
  TSupportAndSystem
>): TAccount & TExperience & TNavigation & TSecurity & TSupportAndSystem {
  return {
    ...account,
    ...experience,
    ...navigation,
    ...security,
    ...supportAndSystem,
  };
}
