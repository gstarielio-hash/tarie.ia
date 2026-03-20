import type {
  BuildInspectorSessionModalsInputParams,
  InspectorSessionModalsInput,
} from "./inspectorUiBuilderTypes";

export function buildInspectorSessionModalsInput({
  activityAndLock,
  attachment,
  offlineQueue,
  settings,
}: BuildInspectorSessionModalsInputParams): InspectorSessionModalsInput {
  return {
    ...activityAndLock,
    ...attachment,
    ...offlineQueue,
    ...settings,
  };
}
