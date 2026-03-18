#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const DEFAULT_FLOW = "android/maestro/login-smoke.yaml";
const DEFAULT_HEALTH_TIMEOUT_SECONDS = 45;
const HEALTH_URL = "http://127.0.0.1:8000/health";

function printHelp() {
  console.log(`
Uso:
  node scripts/run_mobile_maestro_smoke.cjs [--device <id>] [--flow <arquivo>] [--skip-api-start]

Opcoes:
  --device, --device-id, --udid  Serial/UDID do dispositivo Android (opcional).
  --flow                         Fluxo Maestro relativo a raiz do repo.
  --skip-api-start               Nao tenta subir a API local do mobile.
  -h, --help                     Mostra esta ajuda.

Exemplos:
  node scripts/run_mobile_maestro_smoke.cjs
  node scripts/run_mobile_maestro_smoke.cjs --device emulator-5554
  node scripts/run_mobile_maestro_smoke.cjs --flow android/maestro/settings-smoke.yaml
`);
}

function parseArgs(argv) {
  const options = {
    deviceId: process.env.ANDROID_SERIAL || "",
    flow: DEFAULT_FLOW,
    skipApiStart: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--skip-api-start") {
      options.skipApiStart = true;
      continue;
    }

    if (arg.startsWith("--device=")) {
      options.deviceId = arg.slice("--device=".length).trim();
      continue;
    }

    if (arg === "--device" || arg === "--device-id" || arg === "--udid") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Valor ausente para ${arg}`);
      }
      options.deviceId = value.trim();
      index += 1;
      continue;
    }

    if (arg.startsWith("--flow=")) {
      options.flow = arg.slice("--flow=".length).trim();
      continue;
    }

    if (arg === "--flow") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Valor ausente para --flow");
      }
      options.flow = value.trim();
      index += 1;
      continue;
    }

    throw new Error(`Argumento nao reconhecido: ${arg}`);
  }

  if (!options.flow) {
    throw new Error("Flow nao pode ser vazio.");
  }

  return options;
}

function candidateExists(candidate) {
  return Boolean(candidate) && fs.existsSync(candidate);
}

function commandWorks(command, args) {
  const probe = spawnSync(command, args, {
    stdio: "ignore",
    shell: false,
  });
  return !probe.error && probe.status === 0;
}

function findAdbBinary() {
  const home = process.env.HOME || os.homedir() || "";
  const adbBinary = process.platform === "win32" ? "adb.exe" : "adb";
  const fileCandidates = [
    process.env.ADB_PATH,
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, "platform-tools", adbBinary),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, "platform-tools", adbBinary),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe"),
    home && path.join(home, "Android", "Sdk", "platform-tools", adbBinary),
    home && path.join(home, "Android", "sdk", "platform-tools", adbBinary),
  ].filter(Boolean);

  for (const candidate of fileCandidates) {
    if (candidateExists(candidate)) {
      return candidate;
    }
  }

  if (commandWorks(adbBinary, ["version"])) {
    return adbBinary;
  }

  throw new Error(
    "adb nao encontrado. Configure ANDROID_HOME/ANDROID_SDK_ROOT ou adicione platform-tools no PATH.",
  );
}

function findMaestroRunner() {
  const windowsMaestroExe =
    process.env.LOCALAPPDATA &&
    path.join(process.env.LOCALAPPDATA, "Programs", "maestro", "maestro", "bin", "maestro.exe");

  const explicit = process.env.MAESTRO_BIN;
  if (candidateExists(explicit)) {
    return { command: explicit, prefixArgs: [] };
  }

  if (candidateExists(windowsMaestroExe)) {
    return { command: windowsMaestroExe, prefixArgs: [] };
  }

  if (commandWorks("maestro", ["--version"])) {
    return { command: "maestro", prefixArgs: [] };
  }

  if (commandWorks("npx", ["--yes", "maestro", "--version"])) {
    return { command: "npx", prefixArgs: ["--yes", "maestro"] };
  }

  throw new Error(
    "maestro nao encontrado. Instale via curl/get.maestro.mobile.dev ou expo toolchain equivalente.",
  );
}

function findPythonBinary(repoRoot) {
  const webRoot = path.join(repoRoot, "web");
  const exeName = process.platform === "win32" ? "python.exe" : "python";
  const home = process.env.HOME || os.homedir() || "";

  const fileCandidates = [
    process.env.PYTHON_BIN,
    path.join(repoRoot, ".venv-linux", "bin", "python"),
    path.join(repoRoot, ".venv", "bin", "python"),
    path.join(repoRoot, "venv", "bin", "python"),
    path.join(webRoot, ".venv-linux", "bin", "python"),
    path.join(webRoot, ".venv", "bin", "python"),
    path.join(webRoot, "venv", "bin", "python"),
    path.join(repoRoot, ".venv", "Scripts", exeName),
    path.join(repoRoot, "venv", "Scripts", exeName),
    path.join(webRoot, ".venv", "Scripts", exeName),
    path.join(webRoot, "venv", "Scripts", exeName),
    home && path.join(home, ".pyenv", "shims", "python"),
  ].filter(Boolean);

  for (const candidate of fileCandidates) {
    if (candidateExists(candidate)) {
      return candidate;
    }
  }

  if (commandWorks("python3", ["--version"])) {
    return "python3";
  }

  if (commandWorks("python", ["--version"])) {
    return "python";
  }

  throw new Error(
    "Python nao encontrado. Configure PYTHON_BIN ou crie uma venv em .venv-linux/.venv.",
  );
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio || "inherit",
    shell: false,
  });

  if (result.error) {
    throw new Error(`Falha ao executar comando: ${command} (${result.error.message})`);
  }

  if ((result.status ?? 0) !== 0) {
    throw new Error(`Comando retornou erro (${result.status ?? 1}): ${command} ${args.join(" ")}`);
  }

  return result;
}

function parseConnectedDevices(adbBinary) {
  const result = spawnSync(adbBinary, ["devices"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  if (result.error || result.status !== 0) {
    throw new Error("Nao foi possivel listar dispositivos com adb devices.");
  }

  const lines = String(result.stdout || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  const devices = [];
  for (const line of lines) {
    if (line.startsWith("List of devices attached")) {
      continue;
    }
    const [serial, state] = line.split(/\s+/);
    if (serial && state === "device") {
      devices.push(serial);
    }
  }

  return devices;
}

async function testHttpHealth(url = HEALTH_URL) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 3000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(timeoutSeconds = DEFAULT_HEALTH_TIMEOUT_SECONDS) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (await testHttpHealth()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

function startMobileApiInBackground(repoRoot) {
  const webRoot = path.join(repoRoot, "web");
  if (!fs.existsSync(webRoot)) {
    throw new Error(`Pasta web nao encontrada em ${webRoot}`);
  }

  const pythonBinary = findPythonBinary(repoRoot);
  const logPath = path.join(repoRoot, "local-mobile-api.log");
  const errorLogPath = path.join(repoRoot, "local-mobile-api.error.log");

  fs.writeFileSync(logPath, "", "utf8");
  fs.writeFileSync(errorLogPath, "", "utf8");

  const outFd = fs.openSync(logPath, "a");
  const errFd = fs.openSync(errorLogPath, "a");

  const child = spawn(
    pythonBinary,
    ["-m", "uvicorn", "main:app", "--app-dir", ".", "--host", "0.0.0.0", "--port", "8000"],
    {
      cwd: webRoot,
      env: {
        ...process.env,
        SEED_DEV_BOOTSTRAP: "1",
      },
      stdio: ["ignore", outFd, errFd],
      detached: process.platform !== "win32",
      shell: false,
      windowsHide: true,
    },
  );

  child.unref();
}

function resolveFlowPath(repoRoot, flow) {
  const normalizedFlow = flow.replace(/\\/g, path.sep);
  const fullPath = path.isAbsolute(normalizedFlow) ? normalizedFlow : path.join(repoRoot, normalizedFlow);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Flow do Maestro nao encontrado em ${fullPath}`);
  }
  return fullPath;
}

function resolveDeviceId(adbBinary, preferredDevice) {
  if (preferredDevice) {
    return preferredDevice;
  }

  const connectedDevices = parseConnectedDevices(adbBinary);
  if (connectedDevices.length === 1) {
    return connectedDevices[0];
  }

  if (connectedDevices.length === 0) {
    throw new Error("Nenhum dispositivo Android conectado. Conecte um aparelho ou suba um emulador.");
  }

  throw new Error(
    `Mais de um dispositivo detectado (${connectedDevices.join(", ")}). Informe --device <id>.`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const repoRoot = path.resolve(__dirname, "..");
  const flowPath = resolveFlowPath(repoRoot, options.flow);
  const adbBinary = findAdbBinary();
  const maestro = findMaestroRunner();
  const deviceId = resolveDeviceId(adbBinary, options.deviceId);

  if (!(await testHttpHealth())) {
    if (options.skipApiStart) {
      throw new Error(`API local indisponivel em ${HEALTH_URL} e --skip-api-start foi usado.`);
    }

    console.log("Subindo API local do mobile...");
    startMobileApiInBackground(repoRoot);
    const healthy = await waitForHealth();
    if (!healthy) {
      throw new Error(`API local nao respondeu a tempo em ${HEALTH_URL}.`);
    }
  }

  console.log(`Preparando dispositivo ${deviceId}...`);
  runCommand(adbBinary, ["start-server"], { stdio: "ignore" });
  runCommand(adbBinary, ["-s", deviceId, "wait-for-device"]);
  runCommand(adbBinary, ["-s", deviceId, "reverse", "tcp:8000", "tcp:8000"]);

  console.log(`Rodando Maestro: ${options.flow}`);
  runCommand(maestro.command, [...maestro.prefixArgs, "test", "--device", deviceId, flowPath]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
