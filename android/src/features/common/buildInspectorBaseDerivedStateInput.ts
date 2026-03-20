import type {
  BuildInspectorBaseDerivedStateInputParams,
  InspectorBaseDerivedStateInput,
} from "./inspectorDerivedStateTypes";

export function buildInspectorBaseDerivedStateInput({
  chat,
  helpers,
  historyAndOffline,
  settingsAndAccount,
  shell,
}: BuildInspectorBaseDerivedStateInputParams): InspectorBaseDerivedStateInput {
  return {
    ...shell,
    ...chat,
    ...historyAndOffline,
    ...settingsAndAccount,
    ...helpers,
  };
}
