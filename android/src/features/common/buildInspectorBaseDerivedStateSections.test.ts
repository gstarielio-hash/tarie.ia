import {
  buildInspectorConversationDerivedState,
  buildInspectorHistoryAndOfflineDerivedState,
} from "./buildInspectorBaseDerivedStateSections";

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
        laudoCard: { tipo_template: "normal" },
      },
      corDestaque: "laranja",
      densidadeInterface: "confortavel",
      formatarTipoTemplateLaudo: jest.fn().mockReturnValue("Normal"),
      mensagem: "",
      mensagemMesa: "",
      mensagensMesa: [],
      obterEscalaDensidade: jest.fn().mockReturnValue(1),
      obterEscalaFonte: jest.fn().mockReturnValue(1),
      podeEditarConversaNoComposer: jest.fn().mockReturnValue(true),
      preparandoAnexo: false,
      previewChatLiberadoParaConversa: jest.fn().mockReturnValue(false),
      tamanhoFonte: "media",
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
      buildHistorySections: jest.fn((items) => items),
      filaOffline: [
        {
          id: "mesa-1",
          channel: "mesa",
          createdAt: "2026-03-19T10:00:00.000Z",
          lastError: "timeout",
        },
        {
          id: "chat-1",
          channel: "chat",
          createdAt: "2026-03-20T11:00:00.000Z",
          lastError: "",
        },
      ],
      filtroFilaOffline: "all",
      filtroHistorico: "fixadas",
      fixarConversas: true,
      historicoOcultoIds: ["l-3"],
      laudosDisponiveis: [
        {
          id: "l-1",
          titulo: "Laudo 1",
          preview: "Resumo",
          status_card_label: "Em andamento",
          data_iso: "2026-03-20T11:00:00.000Z",
          pinado: true,
        },
        {
          id: "l-2",
          titulo: "Laudo 2",
          preview: "Outro",
          status_card_label: "Concluido",
          data_iso: "2026-03-10T11:00:00.000Z",
          pinado: false,
        },
      ],
      notificacoes: [{ unread: true }, { unread: false }],
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
