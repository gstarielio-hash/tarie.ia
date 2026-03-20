import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createDefaultAppSettings } from "../schema/defaults";
import type { AppSettings } from "../schema/types";
import {
  loadSettingsDocument,
  resetSettingsDocument,
  saveSettingsDocument,
} from "../repository/settingsRepository";

interface SettingsStoreActions {
  replaceAll: (settings: AppSettings) => void;
  reset: () => Promise<void>;
  updateAppearance: (patch: Partial<AppSettings["appearance"]>) => void;
  updateAi: (patch: Partial<AppSettings["ai"]>) => void;
  updateNotifications: (patch: Partial<AppSettings["notifications"]>) => void;
  updateSpeech: (patch: Partial<AppSettings["speech"]>) => void;
  updateDataControls: (patch: Partial<AppSettings["dataControls"]>) => void;
  updateSystem: (patch: Partial<AppSettings["system"]>) => void;
  updateAccount: (patch: Partial<AppSettings["account"]>) => void;
  updateAttachments: (patch: Partial<AppSettings["attachments"]>) => void;
  updateSecurity: (patch: Partial<AppSettings["security"]>) => void;
  updateWith: (updater: (current: AppSettings) => AppSettings) => void;
}

interface SettingsStoreContextValue {
  hydrated: boolean;
  state: AppSettings;
  actions: SettingsStoreActions;
}

const SettingsStoreContext = createContext<SettingsStoreContextValue | null>(null);

export function SettingsStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppSettings>(() => createDefaultAppSettings());
  const [hydrated, setHydrated] = useState(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const document = await loadSettingsDocument();
      if (!active) {
        return;
      }
      setState(document.settings);
      setHydrated(true);
    })();

    return () => {
      active = false;
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      void saveSettingsDocument(state);
      persistTimerRef.current = null;
    }, 250);
  }, [hydrated, state]);

  const updateWith = useCallback((updater: (current: AppSettings) => AppSettings) => {
    setState((current) => updater(current));
  }, []);

  const actions = useMemo<SettingsStoreActions>(
    () => ({
      replaceAll: (settings) => {
        setState(settings);
      },
      reset: async () => {
        const document = await resetSettingsDocument();
        setState(document.settings);
      },
      updateAppearance: (patch) => {
        updateWith((current) => ({ ...current, appearance: { ...current.appearance, ...patch } }));
      },
      updateAi: (patch) => {
        updateWith((current) => ({ ...current, ai: { ...current.ai, ...patch } }));
      },
      updateNotifications: (patch) => {
        updateWith((current) => ({ ...current, notifications: { ...current.notifications, ...patch } }));
      },
      updateSpeech: (patch) => {
        updateWith((current) => ({ ...current, speech: { ...current.speech, ...patch } }));
      },
      updateDataControls: (patch) => {
        updateWith((current) => ({ ...current, dataControls: { ...current.dataControls, ...patch } }));
      },
      updateSystem: (patch) => {
        updateWith((current) => ({ ...current, system: { ...current.system, ...patch } }));
      },
      updateAccount: (patch) => {
        updateWith((current) => ({ ...current, account: { ...current.account, ...patch } }));
      },
      updateAttachments: (patch) => {
        updateWith((current) => ({ ...current, attachments: { ...current.attachments, ...patch } }));
      },
      updateSecurity: (patch) => {
        updateWith((current) => ({ ...current, security: { ...current.security, ...patch } }));
      },
      updateWith,
    }),
    [updateWith],
  );

  const value = useMemo(
    () => ({
      hydrated,
      state,
      actions,
    }),
    [actions, hydrated, state],
  );

  return <SettingsStoreContext.Provider value={value}>{children}</SettingsStoreContext.Provider>;
}

export function useSettingsStoreContext(): SettingsStoreContextValue {
  const context = useContext(SettingsStoreContext);
  if (!context) {
    throw new Error("useSettingsStoreContext deve ser usado dentro de SettingsStoreProvider.");
  }
  return context;
}
