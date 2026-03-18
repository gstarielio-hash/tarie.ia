#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_FLOWS = [
  "android/maestro/login-smoke.yaml",
  "android/maestro/history-smoke.yaml",
  "android/maestro/settings-smoke.yaml",
  "android/maestro/chat-smoke.yaml",
];

function printHelp() {
  console.log(`
Uso:
  node scripts/run_mobile_maestro_suite.cjs [--device <id>] [--flow <arquivo> ...]

Opcoes:
  --device, --device-id, --udid  Serial/UDID do dispositivo Android (opcional).
  --flow                         Fluxo especifico. Pode ser repetido.
  -h, --help                     Mostra esta ajuda.

Exemplos:
  node scripts/run_mobile_maestro_suite.cjs
  node scripts/run_mobile_maestro_suite.cjs --device emulator-5554
  node scripts/run_mobile_maestro_suite.cjs --flow android/maestro/settings-smoke.yaml
`);
}

function parseArgs(argv) {
  const options = {
    deviceId: process.env.ANDROID_SERIAL || "",
    flows: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
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
      const value = arg.slice("--flow=".length).trim();
      if (!value) {
        throw new Error("Valor ausente para --flow");
      }
      options.flows.push(value);
      continue;
    }

    if (arg === "--flow") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Valor ausente para --flow");
      }
      options.flows.push(value.trim());
      index += 1;
      continue;
    }

    throw new Error(`Argumento nao reconhecido: ${arg}`);
  }

  return options;
}

function runFlow(nodeBinary, smokeRunnerPath, flow, deviceId, skipApiStart) {
  const args = [smokeRunnerPath, "--flow", flow];
  if (deviceId) {
    args.push("--device", deviceId);
  }
  if (skipApiStart) {
    args.push("--skip-api-start");
  }

  const result = spawnSync(nodeBinary, args, {
    cwd: path.dirname(smokeRunnerPath),
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw new Error(`Falha ao executar fluxo ${flow}: ${result.error.message}`);
  }

  if ((result.status ?? 0) !== 0) {
    throw new Error(`Fluxo falhou: ${flow}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const flows = options.flows.length > 0 ? options.flows : DEFAULT_FLOWS;
  const smokeRunnerPath = path.resolve(__dirname, "run_mobile_maestro_smoke.cjs");
  const nodeBinary = process.execPath;

  flows.forEach((flow, index) => {
    console.log(`Executando fluxo ${index + 1}/${flows.length}: ${flow}`);
    runFlow(nodeBinary, smokeRunnerPath, flow, options.deviceId, index > 0);
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
