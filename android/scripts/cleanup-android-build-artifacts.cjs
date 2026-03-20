const { existsSync, readdirSync, rmSync } = require("fs");
const path = require("path");

function removerDiretorio(targetPath) {
  try {
    rmSync(targetPath, {
      recursive: true,
      force: true,
      maxRetries: 6,
      retryDelay: 250,
    });
    console.log(`Build limpo: ${targetPath}`);
  } catch (error) {
    console.warn(`Nao consegui limpar ${targetPath}: ${error.message}`);
  }
}

function coletarBuildsAndroid(basePath) {
  if (!existsSync(basePath)) {
    return [];
  }

  const encontrados = [];
  const pilha = [basePath];

  while (pilha.length) {
    const atual = pilha.pop();
    let entradas = [];

    try {
      entradas = readdirSync(atual, { withFileTypes: true });
    } catch (error) {
      console.warn(`Nao consegui listar ${atual}: ${error.message}`);
      continue;
    }

    for (const entrada of entradas) {
      if (!entrada.isDirectory()) {
        continue;
      }

      const proximo = path.join(atual, entrada.name);

      if (
        entrada.name === "build" &&
        path.basename(path.dirname(proximo)) === "android"
      ) {
        encontrados.push(proximo);
        continue;
      }

      if ([".bin", ".cache", ".git"].includes(entrada.name)) {
        continue;
      }

      pilha.push(proximo);
    }
  }

  return encontrados;
}

function limparBuildsAndroidNoNodeModules(projectRoot) {
  const nodeModulesPath = path.join(projectRoot, "node_modules");
  const builds = coletarBuildsAndroid(nodeModulesPath);

  for (const buildPath of builds) {
    removerDiretorio(buildPath);
  }
}

function limparBuildsProjetoAndroid(projectRoot) {
  const candidatos = [
    path.join(projectRoot, "android", "build"),
    path.join(projectRoot, "android", "app", "build"),
  ];

  for (const targetPath of candidatos) {
    if (existsSync(targetPath)) {
      removerDiretorio(targetPath);
    }
  }
}

module.exports = {
  limparBuildsAndroidNoNodeModules,
  limparBuildsProjetoAndroid,
};
