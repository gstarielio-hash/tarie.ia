import { useMemo } from "react";

import type { AppSettings } from "../schema/types";
import { useSettingsStoreContext } from "../store/SettingsStoreProvider";

export function useSettingsStore() {
  return useSettingsStoreContext();
}

export function useSettingsSelector<T>(selector: (state: AppSettings) => T): T {
  const { state } = useSettingsStoreContext();
  return selector(state);
}

export function useAppearanceSettings() {
  return useSettingsSelector((state) => state.appearance);
}

export function useAiSettings() {
  return useSettingsSelector((state) => state.ai);
}

export function useNotificationSettings() {
  return useSettingsSelector((state) => state.notifications);
}

export function useSpeechSettings() {
  return useSettingsSelector((state) => state.speech);
}

export function useDataControlSettings() {
  return useSettingsSelector((state) => state.dataControls);
}

export function useSystemSettings() {
  return useSettingsSelector((state) => state.system);
}

export function useAccountSettings() {
  return useSettingsSelector((state) => state.account);
}

export function useSecuritySettings() {
  return useSettingsSelector((state) => state.security);
}

export function useSettingsSummary() {
  const appearance = useAppearanceSettings();
  const ai = useAiSettings();
  const notifications = useNotificationSettings();
  const system = useSystemSettings();

  return useMemo(
    () => ({
      appearance,
      ai,
      notifications,
      system,
    }),
    [ai, appearance, notifications, system],
  );
}
