import {
  buildInspectorConversationDerivedState,
  buildInspectorHistoryAndOfflineDerivedState,
  buildInspectorLayoutDerivedState,
  buildInspectorSettingsDerivedState,
} from "./buildInspectorBaseDerivedStateSections";

type InspectorBaseDerivedStateInput = Record<string, any>;

export function buildInspectorBaseDerivedState(
  input: InspectorBaseDerivedStateInput,
): Record<string, any> {
  const conversation = buildInspectorConversationDerivedState(input);
  const historyAndOffline = buildInspectorHistoryAndOfflineDerivedState(input);
  const settings = buildInspectorSettingsDerivedState({
    ...input,
    ...conversation,
    ...historyAndOffline,
  });
  const layout = buildInspectorLayoutDerivedState(input);

  return {
    ...conversation,
    ...historyAndOffline,
    ...settings,
    ...layout,
  };
}
