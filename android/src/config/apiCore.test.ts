jest.mock("./observability", () => ({
  registrarEventoObservabilidade: jest.fn(),
}));

import { API_BASE_URL, resolverUrlArquivoApi } from "./apiCore";

describe("apiCore", () => {
  it("preserva URLs absolutas de arquivo", () => {
    expect(resolverUrlArquivoApi("https://cdn.tariel.dev/arquivo.pdf")).toBe(
      "https://cdn.tariel.dev/arquivo.pdf",
    );
  });

  it("resolve caminhos relativos com a base da API", () => {
    expect(resolverUrlArquivoApi("/uploads/laudo.pdf")).toBe(
      `${API_BASE_URL}/uploads/laudo.pdf`,
    );
    expect(resolverUrlArquivoApi("uploads/laudo.pdf")).toBe(
      `${API_BASE_URL}/uploads/laudo.pdf`,
    );
  });

  it("normaliza URLs protocol-relative", () => {
    expect(resolverUrlArquivoApi("//cdn.tariel.dev/imagem.png")).toBe(
      "https://cdn.tariel.dev/imagem.png",
    );
  });
});
