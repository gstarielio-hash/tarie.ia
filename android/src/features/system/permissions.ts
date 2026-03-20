import * as ImagePicker from "expo-image-picker";
import { PermissionsAndroid, Platform } from "react-native";

import {
  readNotificationPermissionGranted,
  requestNotificationPermission,
} from "../chat/notifications";

export interface DevicePermissionSnapshot {
  microphone: boolean;
  camera: boolean;
  files: boolean;
  notifications: boolean;
  biometrics: boolean;
}

async function readMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }
  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
  } catch {
    return false;
  }
}

export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function readDevicePermissionSnapshot(): Promise<DevicePermissionSnapshot> {
  const [microphone, camera, files, notifications] = await Promise.all([
    readMicrophonePermission(),
    ImagePicker.getCameraPermissionsAsync()
      .then((value) => Boolean(value.granted))
      .catch(() => false),
    ImagePicker.getMediaLibraryPermissionsAsync()
      .then(
        (value) =>
          Boolean(value.granted) || value.accessPrivileges === "limited",
      )
      .catch(() => false),
    readNotificationPermissionGranted(),
  ]);

  return {
    microphone,
    camera,
    files,
    notifications,
    biometrics: true,
  };
}

export async function requestDevicePermission(
  permission: "microphone" | "camera" | "files" | "notifications",
): Promise<boolean> {
  if (permission === "microphone") {
    return requestMicrophonePermission();
  }
  if (permission === "camera") {
    return ImagePicker.requestCameraPermissionsAsync()
      .then((value) => Boolean(value.granted))
      .catch(() => false);
  }
  if (permission === "files") {
    return ImagePicker.requestMediaLibraryPermissionsAsync()
      .then(
        (value) =>
          Boolean(value.granted) || value.accessPrivileges === "limited",
      )
      .catch(() => false);
  }
  return requestNotificationPermission();
}
