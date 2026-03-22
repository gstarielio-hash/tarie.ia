jest.mock("./observability", () => ({
  registrarEventoObservabilidade: jest.fn(),
}));

import {
  carregarFeedMesaMobile,
  carregarMensagensMesaMobile,
  enviarMensagemMesaMobile,
} from "./mesaApi";

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

describe("mesaApi", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });
  });

  it("carrega mensagens da mesa com sync incremental", async () => {
    fetchMock.mockResolvedValue(
      criarResposta(
        JSON.stringify({
          laudo_id: 21,
          itens: [],
          cursor_proximo: null,
          cursor_ultimo_id: 44,
          tem_mais: false,
          estado: "relatorio_ativo",
          permite_edicao: true,
          permite_reabrir: false,
          laudo_card: null,
          resumo: {
            atualizado_em: "2026-03-21T10:00:00Z",
            total_mensagens: 4,
            mensagens_nao_lidas: 1,
            pendencias_abertas: 1,
            pendencias_resolvidas: 0,
            ultima_mensagem_id: 44,
            ultima_mensagem_em: "2026-03-21T10:00:00Z",
            ultima_mensagem_preview: "Mesa",
            ultima_mensagem_tipo: "humano_eng",
            ultima_mensagem_remetente_id: 7,
          },
          sync: {
            modo: "delta",
            apos_id: 40,
            cursor_ultimo_id: 44,
          },
        }),
      ),
    );

    await expect(
      carregarMensagensMesaMobile("token-123", 21, { aposId: 40 }),
    ).resolves.toMatchObject({
      laudo_id: 21,
      cursor_ultimo_id: 44,
      sync: { modo: "delta", apos_id: 40 },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/app/api/laudo/21/mesa/mensagens?apos_id=40"),
      expect.any(Object),
    );
  });

  it("envia mensagem da mesa com client_message_id e correlacao", async () => {
    fetchMock.mockResolvedValue(
      criarResposta(
        JSON.stringify({
          laudo_id: 21,
          estado: "relatorio_ativo",
          permite_edicao: true,
          permite_reabrir: false,
          laudo_card: null,
          mensagem: {
            id: 99,
            laudo_id: 21,
            tipo: "humano_insp",
            texto: "Resposta",
            remetente_id: 1,
            data: "21/03 10:00",
            lida: true,
            resolvida_em: "",
            resolvida_em_label: "",
            resolvida_por_nome: "",
            client_message_id: "mesa:abc123",
          },
        }),
      ),
    );

    await enviarMensagemMesaMobile(
      "token-123",
      21,
      "Resposta",
      44,
      "mesa:abc123",
    );

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit.headers.get("X-Client-Request-Id")).toBe("mesa:abc123");
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      texto: "Resposta",
      referencia_mensagem_id: 44,
      client_message_id: "mesa:abc123",
    });
  });

  it("carrega o feed resumido da mesa para os laudos monitorados", async () => {
    fetchMock.mockResolvedValue(
      criarResposta(
        JSON.stringify({
          cursor_atual: "2026-03-21T11:00:00Z",
          laudo_ids: [21, 22],
          itens: [{ laudo_id: 22, resumo: { total_mensagens: 3 } }],
        }),
      ),
    );

    await expect(
      carregarFeedMesaMobile("token-123", {
        laudoIds: [21, 22],
        cursorAtualizadoEm: "2026-03-21T10:00:00Z",
      }),
    ).resolves.toMatchObject({
      cursor_atual: "2026-03-21T11:00:00Z",
      laudo_ids: [21, 22],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/app/api/mobile/mesa/feed?laudo_ids=21%2C22&cursor_atualizado_em=2026-03-21T10%3A00%3A00Z",
      ),
      expect.any(Object),
    );
  });
});
