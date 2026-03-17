const { existsSync, readFileSync, writeFileSync } = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const {
  limparBuildsAndroidNoNodeModules,
  limparBuildsProjetoAndroid,
} = require("./cleanup-android-build-artifacts.cjs");
const { fixAndroidLauncherIcon } = require("./fix-android-launcher-icon.cjs");

function binJavaExists(javaHome) {
  if (!javaHome) {
    return false;
  }

  const javaBinary = process.platform === "win32" ? "java.exe" : "java";
  return existsSync(path.join(javaHome, "bin", javaBinary));
}

function findJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    process.env.ANDROID_STUDIO_JBR,
    "C:\\Program Files\\Android\\Android Studio\\jbr",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Android Studio", "jbr"),
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
    "/Applications/Android Studio.app/Contents/jbr",
  ].filter(Boolean);

  return candidates.find(binJavaExists) || null;
}

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk"),
  ].filter(Boolean);

  return candidates.find((sdkPath) => existsSync(path.join(sdkPath, "platform-tools"))) || null;
}

function findNodeBinary() {
  const candidates = [
    process.execPath,
    process.env.NODE_BINARY,
    path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "nodejs", "node.exe"),
  ].filter(Boolean);

  return candidates.find((nodePath) => existsSync(nodePath)) || null;
}

function ensureLocalProperties(androidSdkPath) {
  const localPropertiesPath = path.join(process.cwd(), "android", "local.properties");
  const escapedSdkPath = androidSdkPath.replace(/\\/g, "\\\\");
  writeFileSync(localPropertiesPath, `sdk.dir=${escapedSdkPath}\n`, "utf8");
}

function lerApiBaseUrlDoEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return "";
  }

  const content = readFileSync(envPath, "utf8");
  const match = content.match(/^\s*EXPO_PUBLIC_API_BASE_URL\s*=\s*(.+)\s*$/m);
  if (!match) {
    return "";
  }

  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

const javaHome = findJavaHome();
if (!javaHome) {
  console.error(
    "Nao encontrei um JDK valido. Instale o Android Studio ou configure JAVA_HOME antes de gerar o APK preview.",
  );
  process.exit(1);
}

const androidSdk = findAndroidSdk();
if (!androidSdk) {
  console.error(
    "Nao encontrei o Android SDK. Abra o Android Studio e confirme se o SDK foi instalado antes de gerar o APK preview.",
  );
  process.exit(1);
}

const nodeBinary = findNodeBinary();
if (!nodeBinary) {
  console.error(
    "Nao encontrei um Node valido. Instale o Node.js ou configure NODE_BINARY antes de gerar o APK preview.",
  );
  process.exit(1);
}

ensureLocalProperties(androidSdk);
fixAndroidLauncherIcon(process.cwd());

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  lerApiBaseUrlDoEnv() ||
  "https://tarie-ia.onrender.com";

console.log(`Usando API mobile preview em ${apiBaseUrl}`);

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidSdk,
  ANDROID_SDK_ROOT: androidSdk,
  NODE_BINARY: nodeBinary,
  EXPO_PUBLIC_API_BASE_URL: apiBaseUrl,
  NODE_ENV: process.env.NODE_ENV || "production",
  RCT_NO_LAUNCH_PACKAGER: "1",
  PATHEXT:
    process.env.PATHEXT && process.env.PATHEXT.includes(".EXE")
      ? process.env.PATHEXT
      : ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC",
  PATH: [
    path.dirname(nodeBinary),
    path.join(javaHome, "bin"),
    path.join(androidSdk, "platform-tools"),
    path.join(androidSdk, "emulator"),
    process.env.PATH || "",
  ].join(path.delimiter),
};

const androidCwd = path.join(process.cwd(), "android");
const gradleStopCommand = process.platform === "win32" ? "cmd.exe" : "./gradlew";
const gradleStopArgs = process.platform === "win32" ? ["/d", "/s", "/c", "gradlew.bat --stop"] : ["--stop"];

spawnSync(gradleStopCommand, gradleStopArgs, {
  cwd: androidCwd,
  env,
  stdio: "ignore",
  shell: false,
});

limparBuildsAndroidNoNodeModules(process.cwd());
limparBuildsProjetoAndroid(process.cwd());

const command = process.platform === "win32" ? "cmd.exe" : "./gradlew";
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "gradlew.bat installRelease"]
    : ["installRelease"];

const child = spawn(command, args, {
  cwd: androidCwd,
  env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => {
  if ((code ?? 0) !== 0) {
    process.exit(code ?? 0);
    return;
  }

  const adbBinary = process.platform === "win32" ? "adb.exe" : "adb";
  const adbPath = path.join(androidSdk, "platform-tools", adbBinary);
  const launcher = spawn(
    adbPath,
    ["shell", "monkey", "-p", "com.tarielia.inspetor", "-c", "android.intent.category.LAUNCHER", "1"],
    {
      env,
      stdio: "inherit",
      shell: false,
    },
  );

  launcher.on("exit", () => {
    process.exit(0);
  });
});
