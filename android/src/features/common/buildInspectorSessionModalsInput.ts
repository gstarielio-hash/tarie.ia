type BuildInspectorSessionModalsInputParams = {
  activityAndLock: Record<string, any>;
  attachment: Record<string, any>;
  offlineQueue: Record<string, any>;
  settings: Record<string, any>;
};

export function buildInspectorSessionModalsInput({
  activityAndLock,
  attachment,
  offlineQueue,
  settings,
}: BuildInspectorSessionModalsInputParams) {
  return {
    ...activityAndLock,
    ...attachment,
    ...offlineQueue,
    ...settings,
  };
}
