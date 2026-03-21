jest.mock("./observability", () => ({
  registrarEventoObservabilidade: jest.fn(),
}));

import { enviarMensagemChatMobile } from "./chatApi";

function criarResposta(
  body: string,
  init?: { status?: number; contentType?: string },
) {
  const status = init?.status ?? 200;
  const headers = new Headers();
  headers.set("content-type", init?.contentType ?? "application/json");
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: async () => body,
  } as Response;
}

describe("chatApi", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });
  });

  it("normaliza a resposta JSON do chat", async () => {
    fetchMock.mockResolvedValue(
      criarResposta(
        JSON.stringify({
          laudo_id: 42,
          texto: "Resposta pronta",
          modo: "curto",
          citacoes: [{ fonte: "manual" }],
          confianca_ia: { score: 0.91 },
        }),
      ),
    );

    await expect(
      enviarMensagemChatMobile("token-123", {
        mensagem: "oi",
        laudoId: 42,
        modo: "detalhado",
      }),
    ).resolves.toMatchObject({
      laudoId: 42,
      assistantText: "Resposta pronta",
      modo: "curto",
      citacoes: [{ fonte: "manual" }],
      confiancaIa: { score: 0.91 },
    });
  });

  it("agrega eventos SSE do chat em uma resposta final", async () => {
    fetchMock.mockResolvedValue(
      criarResposta(
        [
          'data: {"laudo_id":77}',
          "",
          'data: {"texto":"Primeira parte "}',
          "",
          'data: {"texto":"segunda parte","citacoes":[{"fonte":"guia"}],"confianca_ia":{"score":0.88}}',
          "",
          "data: [FIM]",
          "",
        ].join("\n"),
        { contentType: "text/event-stream" },
      ),
    );

    await expect(
      enviarMensagemChatMobile("token-123", {
        mensagem: "resuma",
        modo: "deepresearch",
      }),
    ).resolves.toMatchObject({
      laudoId: 77,
      assistantText: "Primeira parte segunda parte",
      modo: "deep_research",
      citacoes: [{ fonte: "guia" }],
      confiancaIa: { score: 0.88 },
    });
  });
});
