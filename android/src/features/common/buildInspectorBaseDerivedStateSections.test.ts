import type { MobileLaudoCard } from "../../types/mobile";
import type {
  MobileActivityNotification,
  OfflinePendingMessage,
} from "../chat/types";
import {
  buildInspectorConversationDerivedState,
  buildInspectorHistoryAndOfflineDerivedState,
} from "./buildInspectorBaseDerivedStateSections";

function criarLaudoParcial(
  overrides: Partial<MobileLaudoCard>,
): MobileLaudoCard {
  return {
    id: 42,
    titulo: "Laudo",
    preview: "Resumo",
    pinado: false,
    data_iso: "2026-03-20T10:00:00.000Z",
    data_br: "20/03/2026",
    hora_br: "10:00",
    tipo_template: "TC",
    status_revisao: "ativo",
    status_card: "aguardando",
    status_card_label: "Aguardando",
    permite_edicao: true,
    permite_reabrir: false,
    possui_historico: true,
    ...overrides,
  };
}

function criarPendenciaParcial(
  overrides: Partial<OfflinePendingMessage>,
): OfflinePendingMessage {
  return {
    id: "offline-1",
    channel: "chat",
    laudoId: null,
    text: "Mensagem pendente",
    createdAt: "2026-03-20T10:00:00.000Z",
    title: "Pendência",
    attachment: null,
    referenceMessageId: null,
    attempts: 0,
    lastAttemptAt: "",
    lastError: "",
    nextRetryAt: "",
    aiMode: "detalhado",
    aiSummary: "",
    aiMessagePrefix: "",
    ...overrides,
  };
}

function criarNotificacaoParcial(
  overrides: Partial<MobileActivityNotification>,
): MobileActivityNotification {
  return {
    id: "notif-1",
    kind: "status",
    laudoId: null,
    title: "Atualização",
    body: "Há uma atualização.",
    createdAt: "2026-03-20T10:00:00.000Z",
    unread: true,
    targetThread: "chat",
    ...overrides,
  };
}

describe("buildInspectorBaseDerivedStateSections", () => {
  it("prioriza o placeholder de reabertura quando a conversa exige reabrir", () => {
    const state = buildInspectorConversationDerivedState({
      anexoMesaRascunho: null,
      anexoRascunho: null,
      arquivosPermitidos: true,
      abaAtiva: "chat",
      colorScheme: "light",
      conversa: {
        laudoId: 42,
        mensagens: [],
        permiteEdicao: true,
        permiteReabrir: true,
        estado: "relatorio_ativo",
        statusCard: "aguardando",
        laudoCard: criarLaudoParcial({ tipo_template: "normal" }),
        modo: "detalhado",
      },
      corDestaque: "laranja",
      densidadeInterface: "confortável",
      formatarTipoTemplateLaudo: jest.fn().mockReturnValue("Normal"),
      mensagem: "",
      mensagemMesa: "",
      mensagensMesa: [],
      obterEscalaDensidade: jest.fn().mockReturnValue(1),
      obterEscalaFonte: jest.fn().mockReturnValue(1),
      podeEditarConversaNoComposer: jest.fn().mockReturnValue(true),
      preparandoAnexo: false,
      previewChatLiberadoParaConversa: jest.fn().mockReturnValue(false),
      tamanhoFonte: "médio",
      temaApp: "claro",
      uploadArquivosAtivo: true,
      carregandoConversa: false,
      carregandoMesa: false,
      enviandoMensagem: false,
      enviandoMesa: false,
    });

    expect(state.placeholderComposer).toBe("Reabra o laudo para continuar.");
    expect(state.podeEnviarComposer).toBe(false);
    expect(state.vendoMesa).toBe(false);
  });

  it("resume a fila offline e filtra o historico por fixadas", () => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-03-20T12:00:00.000Z").getTime());

    const state = buildInspectorHistoryAndOfflineDerivedState({
      buscaHistorico: "",
      buildHistorySections: jest.fn((items) => [
        {
          key: "fixadas",
          title: "Fixadas",
          items,
        },
      ]),
      filaOffline: [
        criarPendenciaParcial({
          id: "mesa-1",
          channel: "mesa",
          createdAt: "2026-03-19T10:00:00.000Z",
          lastError: "timeout",
        }),
        criarPendenciaParcial({
          id: "chat-1",
          channel: "chat",
          createdAt: "2026-03-20T11:00:00.000Z",
          lastError: "",
        }),
      ],
      filtroFilaOffline: "all",
      filtroHistorico: "fixadas",
      fixarConversas: true,
      historicoOcultoIds: [3],
      laudosDisponiveis: [
        criarLaudoParcial({
          id: 1,
          titulo: "Laudo 1",
          preview: "Resumo",
          status_card_label: "Em andamento",
          data_iso: "2026-03-20T11:00:00.000Z",
          pinado: true,
        }),
        criarLaudoParcial({
          id: 2,
          titulo: "Laudo 2",
          preview: "Outro",
          status_card_label: "Concluido",
          data_iso: "2026-03-10T11:00:00.000Z",
          pinado: false,
        }),
      ],
      notificacoes: [
        criarNotificacaoParcial({ unread: true }),
        criarNotificacaoParcial({ id: "notif-2", unread: false }),
      ],
      pendenciaFilaProntaParaReenvio: jest
        .fn()
        .mockImplementation((item) => item.id === "chat-1"),
      prioridadePendenciaOffline: jest
        .fn()
        .mockImplementation((item) => (item.channel === "chat" ? 0 : 1)),
      statusApi: "online",
    });

    expect(
      state.filaOfflineOrdenada.map((item: { id: string }) => item.id),
    ).toEqual(["chat-1", "mesa-1"]);
    expect(state.totalFilaOfflinePronta).toBe(1);
    expect(state.totalFilaOfflineFalha).toBe(1);
    expect(state.resumoFilaOffline).toContain("2 envios pendentes");
    expect(state.historicoAgrupadoFinal).toHaveLength(1);
    expect(state.conversasFixadasTotal).toBe(1);
    expect(state.notificacoesNaoLidas).toBe(1);
  });
});
