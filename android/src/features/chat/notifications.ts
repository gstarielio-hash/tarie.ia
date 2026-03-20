import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import type { AppSettings } from "../../settings";
import type { MobileActivityNotification } from "./types";
import { categoriaNotificacaoPorKind } from "./types";

let initialized = false;

function resolveAndroidChannelSound(
  soundEnabled: boolean,
): string | null | undefined {
  if (!soundEnabled) {
    return null;
  }
  return undefined;
}

function resolveNotificationContentSound(
  soundEnabled: boolean,
): string | undefined {
  if (!soundEnabled) {
    return undefined;
  }
  return Platform.OS === "ios" ? "default" : undefined;
}

function buildChannelId(notification: MobileActivityNotification): string {
  const category = categoriaNotificacaoPorKind(notification.kind);
  if (category === "critical") {
    return "tariel-critical";
  }
  if (category === "system") {
    return "tariel-system";
  }
  if (category === "mesa") {
    return "tariel-mesa";
  }
  return "tariel-chat";
}

export function initializeNotificationsRuntime(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function syncNotificationChannels(
  settings: AppSettings["notifications"],
): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Promise.all([
    Notifications.setNotificationChannelAsync("tariel-chat", {
      name: "Tariel Chat",
      importance: Notifications.AndroidImportance.DEFAULT,
      enableLights: true,
      enableVibrate: settings.vibrationEnabled,
      showBadge: true,
      sound: resolveAndroidChannelSound(settings.soundEnabled),
      vibrationPattern: settings.vibrationEnabled ? [0, 120, 120] : undefined,
    }),
    Notifications.setNotificationChannelAsync("tariel-mesa", {
      name: "Tariel Mesa",
      importance: Notifications.AndroidImportance.HIGH,
      enableLights: true,
      enableVibrate: settings.vibrationEnabled,
      showBadge: true,
      sound: resolveAndroidChannelSound(settings.soundEnabled),
      vibrationPattern: settings.vibrationEnabled
        ? [0, 160, 80, 160]
        : undefined,
    }),
    Notifications.setNotificationChannelAsync("tariel-system", {
      name: "Tariel Sistema",
      importance: Notifications.AndroidImportance.DEFAULT,
      enableLights: false,
      enableVibrate: settings.vibrationEnabled,
      showBadge: false,
      sound: resolveAndroidChannelSound(settings.soundEnabled),
    }),
    Notifications.setNotificationChannelAsync("tariel-critical", {
      name: "Tariel Alertas críticos",
      importance: Notifications.AndroidImportance.MAX,
      enableLights: true,
      enableVibrate: settings.vibrationEnabled,
      showBadge: true,
      sound: resolveAndroidChannelSound(settings.soundEnabled),
      vibrationPattern: settings.vibrationEnabled
        ? [0, 240, 120, 240]
        : undefined,
    }),
  ]);
}

export async function readNotificationPermissionGranted(): Promise<boolean> {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    return (
      permissions.granted ||
      permissions.ios?.status ===
        Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const permissions = await Notifications.requestPermissionsAsync();
    return (
      permissions.granted ||
      permissions.ios?.status ===
        Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

export function shouldDispatchNotificationBySettings(
  notification: MobileActivityNotification,
  settings: AppSettings["notifications"],
): boolean {
  const category = categoriaNotificacaoPorKind(notification.kind);
  if (category === "chat") {
    return settings.chatCategoryEnabled;
  }
  if (category === "mesa") {
    return settings.mesaCategoryEnabled;
  }
  if (category === "system") {
    return settings.systemCategoryEnabled;
  }
  return settings.criticalAlertsEnabled;
}

export async function scheduleLocalActivityNotification(params: {
  notification: MobileActivityNotification;
  settings: AppSettings["notifications"];
}): Promise<void> {
  if (!params.settings.pushEnabled) {
    return;
  }
  if (!(await readNotificationPermissionGranted())) {
    return;
  }
  if (
    !shouldDispatchNotificationBySettings(params.notification, params.settings)
  ) {
    return;
  }

  const content: Notifications.NotificationContentInput = {
    title: params.notification.title,
    body: params.notification.body,
    sound: resolveNotificationContentSound(params.settings.soundEnabled),
    data: {
      id: params.notification.id,
      laudoId: params.notification.laudoId,
      kind: params.notification.kind,
      targetThread: params.notification.targetThread,
    },
  };

  if (Platform.OS === "android") {
    (
      content as Notifications.NotificationContentInput & {
        channelId?: string;
      }
    ).channelId = buildChannelId(params.notification);
  }

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: null,
  });
}
