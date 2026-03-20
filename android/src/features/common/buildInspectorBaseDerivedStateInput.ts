type BuildInspectorBaseDerivedStateInputParams = {
  chat: Record<string, any>;
  helpers: Record<string, any>;
  historyAndOffline: Record<string, any>;
  settingsAndAccount: Record<string, any>;
  shell: Record<string, any>;
};

export function buildInspectorBaseDerivedStateInput({
  chat,
  helpers,
  historyAndOffline,
  settingsAndAccount,
  shell,
}: BuildInspectorBaseDerivedStateInputParams) {
  return {
    ...shell,
    ...chat,
    ...historyAndOffline,
    ...settingsAndAccount,
    ...helpers,
  };
}
