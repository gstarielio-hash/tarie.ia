const { chmodSync, existsSync, readdirSync, statSync } = require("fs");
const path = require("path");

function appendIfFile(candidates, filePath) {
  if (!filePath || !existsSync(filePath)) {
    return;
  }

  const stats = statSync(filePath);
  if (stats.isFile()) {
    candidates.push(filePath);
  }
}

function fixExecutableBit(filePath) {
  const stats = statSync(filePath);
  if ((stats.mode & 0o111) === 0o111) {
    return;
  }

  chmodSync(filePath, stats.mode | 0o111);
  console.log(`Permissao de exec ajustada: ${filePath}`);
}

function fixLinuxNodeExecutables(projectRoot) {
  if (process.platform === "win32") {
    return;
  }

  const candidates = [];
  const dotBinDir = path.join(projectRoot, "node_modules", ".bin");
  if (existsSync(dotBinDir)) {
    for (const entry of readdirSync(dotBinDir)) {
      if (entry.endsWith(".cmd") || entry.endsWith(".ps1")) {
        continue;
      }
      appendIfFile(candidates, path.join(dotBinDir, entry));
    }
  }

  appendIfFile(candidates, path.join(projectRoot, "node_modules", "typescript", "bin", "tsc"));
  appendIfFile(candidates, path.join(projectRoot, "node_modules", "typescript", "bin", "tsserver"));

  const dotslashRoot = path.join(projectRoot, "node_modules", "fb-dotslash", "bin");
  appendIfFile(candidates, path.join(dotslashRoot, "dotslash"));
  if (existsSync(dotslashRoot)) {
    for (const entry of readdirSync(dotslashRoot)) {
      appendIfFile(candidates, path.join(dotslashRoot, entry, "dotslash"));
    }
  }

  for (const candidate of candidates) {
    fixExecutableBit(candidate);
  }
}

module.exports = { fixLinuxNodeExecutables };
