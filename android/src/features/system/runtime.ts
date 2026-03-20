import Constants from "expo-constants";
import * as Application from "expo-application";

export interface InstalledAppRuntimeInfo {
  appName: string;
  version: string;
  build: string;
  applicationId: string;
  versionLabel: string;
  buildLabel: string;
  updateStatusFallback: string;
}

export function getInstalledAppRuntimeInfo(): InstalledAppRuntimeInfo {
  const appName = Constants.expoConfig?.name || "Tariel Inspetor";
  const version =
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    "1.0.0";
  const build =
    Application.nativeBuildVersion ||
    String(
      Constants.expoConfig?.android?.versionCode ||
        Constants.expoConfig?.ios?.buildNumber ||
        "1",
    );
  const applicationId =
    Application.applicationId ||
    Constants.expoConfig?.android?.package ||
    Constants.expoConfig?.ios?.bundleIdentifier ||
    "";

  return {
    appName,
    version,
    build,
    applicationId,
    versionLabel: `${version}`,
    buildLabel: build ? `build ${build}` : "build indisponível",
    updateStatusFallback:
      "Este app não tem integração OTA/store check configurada nesta build. A verificação confirma conectividade e a versão instalada.",
  };
}
