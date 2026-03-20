import {
  buildInspectorConversationDerivedState,
  buildInspectorHistoryAndOfflineDerivedState,
  buildInspectorLayoutDerivedState,
  buildInspectorSettingsDerivedState,
} from "./buildInspectorBaseDerivedStateSections";
import type {
  InspectorBaseDerivedStateInput,
  InspectorSettingsDerivedStateResolvedInput,
} from "./inspectorDerivedStateTypes";

export function buildInspectorBaseDerivedState(
  input: InspectorBaseDerivedStateInput,
) {
  const conversation = buildInspectorConversationDerivedState(input);
  const historyAndOffline = buildInspectorHistoryAndOfflineDerivedState(input);
  const settings = buildInspectorSettingsDerivedState({
    ...input,
    ...conversation,
    ...historyAndOffline,
  } satisfies InspectorSettingsDerivedStateResolvedInput);
  const layout = buildInspectorLayoutDerivedState(input);

  return {
    ...conversation,
    ...historyAndOffline,
    ...settings,
    ...layout,
  };
}
