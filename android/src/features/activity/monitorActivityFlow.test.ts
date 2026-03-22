jest.mock("../../config/api", () => ({
  carregarFeedMesaMobile: jest.fn(),
  carregarLaudosMobile: jest.fn(),
  carregarMensagensMesaMobile: jest.fn(),
}));

jest.mock("../../config/observability", () => ({
  registrarEventoObservabilidade: jest.fn(),
}));

import {
  carregarFeedMesaMobile,
  carregarLaudosMobile,
  carregarMensagensMesaMobile,
} from "../../config/api";
import { runMonitorActivityFlow } from "./monitorActivityFlow";

describe("runMonitorActivityFlow", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("consulta mensagens da mesa apenas para laudos alterados no feed", async () => {
    (carregarLaudosMobile as jest.Mock).mockResolvedValue({
      itens: [
        {
          id: 21,
          titulo: "Laudo 21",
          status_card: "ajustes",
          status_revisao: "rejeitado",
          status_card_label: "Ajustes",
          permite_edicao: false,
          permite_reabrir: true,
        },
        {
          id: 22,
          titulo: "Laudo 22",
          status_card: "aguardando",
          status_revisao: "aguardando",
          status_card_label: "Aguardando",
          permite_edicao: false,
          permite_reabrir: false,
        },
      ],
    });
    (carregarFeedMesaMobile as jest.Mock).mockResolvedValue({
      cursor_atual: "2026-03-21T13:00:00Z",
      laudo_ids: [21, 22],
      itens: [{ laudo_id: 22, resumo: { total_mensagens: 4 } }],
    });
    (carregarMensagensMesaMobile as jest.Mock).mockResolvedValue({
      laudo_id: 22,
      itens: [],
      cursor_proximo: null,
      tem_mais: false,
      estado: "aguardando",
      permite_edicao: false,
      permite_reabrir: false,
      laudo_card: null,
    });

    const mesaFeedCursorRef = { current: "" };

    await runMonitorActivityFlow({
      accessToken: "token-123",
      monitorandoAtividade: false,
      conversaLaudoId: 21,
      conversaLaudoTitulo: "Laudo 21",
      sessionUserId: 1,
      assinaturaStatusLaudo: (item) => `${item.id}:${item.status_card}`,
      assinaturaMensagemMesa: (item) => `${item.id}:${item.resolvida_em || ""}`,
      selecionarLaudosParaMonitoramentoMesa: () => [21, 22],
      criarNotificacaoStatusLaudo: (item) => ({ id: `status:${item.id}` }),
      criarNotificacaoMesa: (kind, item) => ({ id: `${kind}:${item.id}` }),
      atualizarResumoLaudoAtual: jest.fn(),
      registrarNotificacoes: jest.fn(),
      erroSugereModoOffline: jest.fn().mockReturnValue(false),
      chaveCacheLaudo: (laudoId) => String(laudoId || ""),
      statusSnapshotRef: { current: {} },
      mesaSnapshotRef: {
        current: {
          21: { 1: "1||" },
          22: { 2: "2||" },
        },
      },
      mesaFeedCursorRef,
      onSetMonitorandoAtividade: jest.fn(),
      onSetLaudosDisponiveis: jest.fn(),
      onSetCacheLaudos: jest.fn(),
      onSetErroLaudos: jest.fn(),
      onSetMensagensMesa: jest.fn(),
      onSetLaudoMesaCarregado: jest.fn(),
      onSetCacheMesa: jest.fn(),
      onSetStatusApi: jest.fn(),
      onSetErroConversaIfEmpty: jest.fn(),
    });

    expect(carregarFeedMesaMobile).toHaveBeenCalledWith("token-123", {
      laudoIds: [21, 22],
      cursorAtualizadoEm: null,
    });
    expect(carregarMensagensMesaMobile).toHaveBeenCalledTimes(1);
    expect(carregarMensagensMesaMobile).toHaveBeenCalledWith("token-123", 22);
    expect(mesaFeedCursorRef.current).toBe("2026-03-21T13:00:00Z");
  });
});
