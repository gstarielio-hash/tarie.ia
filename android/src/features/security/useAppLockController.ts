import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { Alert, AppState, type AppStateStatus, Linking } from "react-native";

import type { SettingsLockTimeout } from "../../settings";
import {
  readDevicePermissionSnapshot,
  requestDevicePermission,
} from "../system/permissions";
import type { MobileSessionState } from "../session/sessionTypes";

interface UseAppLockControllerParams {
  appLocked: boolean;
  session: MobileSessionState | null;
  settingsHydrated: boolean;
  requireAuthOnOpen: boolean;
  lockTimeout: SettingsLockTimeout;
  reauthenticationExpiresAt: string;
  deviceBiometricsEnabled: boolean;
  microphonePermissionGranted: boolean;
  cameraPermissionGranted: boolean;
  filesPermissionGranted: boolean;
  notificationsPermissionGranted: boolean;
  biometricsPermissionGranted: boolean;
  pushEnabled: boolean;
  uploadFilesEnabled: boolean;
  voiceInputEnabled: boolean;
  setMicrophonePermissionGranted: (value: boolean) => void;
  setCameraPermissionGranted: (value: boolean) => void;
  setFilesPermissionGranted: (value: boolean) => void;
  setNotificationsPermissionGranted: (value: boolean) => void;
  setBiometricsPermissionGranted: (value: boolean) => void;
  setPushEnabled: (value: boolean) => void;
  setDeviceBiometricsEnabled: (value: boolean) => void;
  setUploadFilesEnabled: (value: boolean) => void;
  setVoiceInputEnabled: (value: boolean) => void;
  setAppLocked: Dispatch<SetStateAction<boolean>>;
  isReauthenticationStillValid: (expiresAt: string) => boolean;
  resolveLockTimeoutMs: (lockTimeout: SettingsLockTimeout) => number | null;
  openReauthFlow: (reason: string, onSuccess?: () => void) => void;
  registerSecurityEvent: (event: {
    title: string;
    meta: string;
    status: string;
    type: "login" | "provider" | "2fa" | "data" | "session";
    critical?: boolean;
  }) => void;
}

export function useAppLockController(params: UseAppLockControllerParams) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundAtRef = useRef<number | null>(null);

  async function atualizarPermissoesDoSistema() {
    const snapshot = await readDevicePermissionSnapshot();
    const current = paramsRef.current;
    current.setMicrophonePermissionGranted(snapshot.microphone);
    current.setCameraPermissionGranted(snapshot.camera);
    current.setFilesPermissionGranted(snapshot.files);
    current.setNotificationsPermissionGranted(snapshot.notifications);
    current.setBiometricsPermissionGranted(snapshot.biometrics);
  }

  async function handleGerenciarPermissao(nome: string, status: string) {
    const current = paramsRef.current;
    const chavePermissao =
      nome === "Microfone"
        ? "microphone"
        : nome === "Câmera"
          ? "camera"
          : nome === "Arquivos"
            ? "files"
            : nome === "Notificações"
              ? "notifications"
              : null;

    if (!chavePermissao) {
      current.registerSecurityEvent({
        title: `Permissão revisada: ${nome}`,
        meta: `Status atual ${status}. Ajustes do sistema foram abertos pelo usuário.`,
        status: "Agora",
        type: "session",
      });
      void Linking.openSettings();
      return;
    }

    const concedida = await requestDevicePermission(chavePermissao);
    if (chavePermissao === "microphone") {
      current.setMicrophonePermissionGranted(concedida);
    } else if (chavePermissao === "camera") {
      current.setCameraPermissionGranted(concedida);
    } else if (chavePermissao === "files") {
      current.setFilesPermissionGranted(concedida);
    } else {
      current.setNotificationsPermissionGranted(concedida);
      if (!concedida) {
        current.setPushEnabled(false);
      }
    }

    current.registerSecurityEvent({
      title: `Permissão revisada: ${nome}`,
      meta: concedida
        ? `${nome} concedida diretamente pelo fluxo do app.`
        : `Status atual ${status}.`,
      status: "Agora",
      type: "session",
    });

    if (!concedida) {
      Alert.alert(
        `${nome} indisponível`,
        `O acesso a ${nome.toLowerCase()} continua bloqueado. Abra os ajustes do sistema para liberar essa permissão.`,
        [
          { text: "Agora não", style: "cancel" },
          {
            text: "Abrir ajustes",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ],
      );
    }
  }

  function handleAbrirPermissaoNotificacoes() {
    void handleGerenciarPermissao(
      "Notificações",
      paramsRef.current.notificationsPermissionGranted ? "permitido" : "negado",
    );
  }

  function handleDesbloquearAplicativo() {
    const current = paramsRef.current;
    if (!current.session) {
      current.setAppLocked(false);
      return;
    }

    if (
      !current.requireAuthOnOpen ||
      current.isReauthenticationStillValid(current.reauthenticationExpiresAt)
    ) {
      current.setAppLocked(false);
      return;
    }

    current.openReauthFlow(
      "Confirme sua identidade para desbloquear o app do inspetor.",
      () => {
        current.setAppLocked(false);
      },
    );
  }

  useEffect(() => {
    if (!params.settingsHydrated) {
      return;
    }
    void atualizarPermissoesDoSistema();
  }, [params.settingsHydrated]);

  useEffect(() => {
    if (!params.session) {
      params.setAppLocked(false);
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      const current = paramsRef.current;
      const estadoAtual = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "background" || nextState === "inactive") {
        backgroundAtRef.current = Date.now();
        return;
      }

      if (nextState !== "active" || estadoAtual === "active") {
        return;
      }

      void atualizarPermissoesDoSistema();

      if (!current.requireAuthOnOpen) {
        current.setAppLocked(false);
        return;
      }

      const timeoutMs = current.resolveLockTimeoutMs(current.lockTimeout);
      if (timeoutMs === null) {
        current.setAppLocked(false);
        return;
      }

      const tempoFora = backgroundAtRef.current
        ? Date.now() - backgroundAtRef.current
        : Number.POSITIVE_INFINITY;
      if (timeoutMs > 0 && tempoFora < timeoutMs) {
        return;
      }

      if (
        current.deviceBiometricsEnabled &&
        current.isReauthenticationStillValid(current.reauthenticationExpiresAt)
      ) {
        current.setAppLocked(false);
        return;
      }

      current.setAppLocked(true);
    });

    return () => {
      subscription.remove();
    };
  }, [params.session]);

  useEffect(() => {
    if (params.notificationsPermissionGranted || !params.pushEnabled) {
      return;
    }
    params.setPushEnabled(false);
  }, [
    params.notificationsPermissionGranted,
    params.pushEnabled,
    params.setPushEnabled,
  ]);

  useEffect(() => {
    if (params.biometricsPermissionGranted || !params.deviceBiometricsEnabled) {
      return;
    }
    params.setDeviceBiometricsEnabled(false);
  }, [
    params.biometricsPermissionGranted,
    params.deviceBiometricsEnabled,
    params.setDeviceBiometricsEnabled,
  ]);

  useEffect(() => {
    if (params.filesPermissionGranted || !params.uploadFilesEnabled) {
      return;
    }
    params.setUploadFilesEnabled(false);
  }, [
    params.filesPermissionGranted,
    params.setUploadFilesEnabled,
    params.uploadFilesEnabled,
  ]);

  useEffect(() => {
    if (params.microphonePermissionGranted || !params.voiceInputEnabled) {
      return;
    }
    params.setVoiceInputEnabled(false);
  }, [
    params.microphonePermissionGranted,
    params.setVoiceInputEnabled,
    params.voiceInputEnabled,
  ]);

  return {
    state: {
      bloqueioAppAtivo: params.appLocked,
    },
    actions: {
      atualizarPermissoesDoSistema,
      handleAbrirPermissaoNotificacoes,
      handleDesbloquearAplicativo,
      handleGerenciarPermissao,
      setBloqueioAppAtivo: params.setAppLocked,
    },
  };
}
