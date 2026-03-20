type BuildInspectorSettingsDrawerInputParams = {
  account: Record<string, any>;
  experience: Record<string, any>;
  navigation: Record<string, any>;
  security: Record<string, any>;
  supportAndSystem: Record<string, any>;
};

export function buildInspectorSettingsDrawerInput({
  account,
  experience,
  navigation,
  security,
  supportAndSystem,
}: BuildInspectorSettingsDrawerInputParams) {
  return {
    ...account,
    ...experience,
    ...navigation,
    ...security,
    ...supportAndSystem,
  };
}
