import type {
  MobileBootstrapResponse,
  MobileLaudoCard,
  MobileMesaMessage,
} from "../../types/mobile";
import type {
  ChatState,
  MobileActivityNotification,
  OfflinePendingMessage,
} from "../chat/types";
import type { MobileReadCache } from "../common/readCacheTypes";
import { runBootstrapAppFlow } from "./runBootstrapAppFlow";

function criarBootstrapMock() {
  return {
    ok: true,
    usuario: {
      id: 7,
      email: "inspetor@tariel.test",
      nome_completo: "Inspetor Tariel",
      telefone: "(11) 99999-0000",
      foto_perfil_url: "",
      empresa_nome: "Tariel",
      empresa_id: 3,
      nivel_acesso: 5,
    },
    app: {
      nome: "Tariel Inspetor",
      portal: "inspetor",
      api_base_url: "https://api.tariel.test",
      suporte_whatsapp: "",
    },
  } satisfies MobileBootstrapResponse;
}

function criarCacheVazio(): MobileReadCache {
  return {
    bootstrap: null,
    laudos: [],
    conversaAtual: null,
    conversasPorLaudo: {},
    mesaPorLaudo: {},
    chatDrafts: {},
    mesaDrafts: {},
    chatAttachmentDrafts: {},
    mesaAttachmentDrafts: {},
    updatedAt: "",
  };
}

describe("runBootstrapAppFlow", () => {
  it("hidrata sessao online com token salvo", async () => {
    const bootstrap = criarBootstrapMock();
    const onSetStatusApi = jest.fn();
    const onSetEmail = jest.fn();
    const onSetFilaOffline = jest.fn();
    const onSetNotificacoes = jest.fn();
    const onSetCacheLeitura = jest.fn();
    const onSetLaudosFixadosIds = jest.fn();
    const onSetHistoricoOcultoIds = jest.fn();
    const onMergeCacheBootstrap = jest.fn();
    const onSetSession = jest.fn();
    const onSetUsandoCacheOffline = jest.fn();
    const onSetLaudosDisponiveis = jest.fn();
    const onSetConversa = jest.fn();
    const onSetMensagensMesa = jest.fn();
    const onSetLaudoMesaCarregado = jest.fn();
    const onSetErroLaudos = jest.fn();

    await runBootstrapAppFlow({
      aplicarPreferenciasLaudos: (itens) => itens,
      carregarBootstrapMobile: jest.fn().mockResolvedValue(bootstrap),
      chaveCacheLaudo: (laudoId) => `laudo:${laudoId ?? "rascunho"}`,
      erroSugereModoOffline: () => false,
      chatHistoryEnabled: true,
      deviceBackupEnabled: true,
      lerCacheLeituraLocal: jest.fn().mockResolvedValue({
        bootstrap: null,
        laudos: [],
        conversaAtual: null,
        conversasPorLaudo: {},
        mesaPorLaudo: {},
        chatDrafts: {},
        mesaDrafts: {},
        chatAttachmentDrafts: {},
        mesaAttachmentDrafts: {},
        updatedAt: "",
      }),
      lerEstadoHistoricoLocal: jest.fn().mockResolvedValue({
        laudosFixadosIds: [10],
        historicoOcultoIds: [11],
      }),
      lerFilaOfflineLocal: jest.fn().mockResolvedValue([
        {
          id: "offline-1",
          channel: "chat",
          laudoId: null,
          text: "Pendencia local",
          createdAt: "2026-03-20T10:00:00.000Z",
          title: "Mensagem pendente",
          attachment: null,
          referenceMessageId: null,
          attempts: 0,
          lastAttemptAt: "",
          lastError: "",
          nextRetryAt: "",
          aiMode: "detalhado",
          aiSummary: "",
          aiMessagePrefix: "",
        } satisfies OfflinePendingMessage,
      ]),
      lerNotificacoesLocais: jest.fn().mockResolvedValue([
        {
          id: "notif-1",
          kind: "status",
          laudoId: null,
          title: "Atualizacao",
          body: "Ha uma atualizacao.",
          createdAt: "2026-03-20T10:00:00.000Z",
          unread: true,
          targetThread: "chat",
        } satisfies MobileActivityNotification,
      ]),
      limparCachePorPrivacidade: (cache) => cache,
      obterItemSeguro: jest
        .fn()
        .mockImplementation(async (key: string) =>
          key === "tariel_inspetor_access_token"
            ? "token-online"
            : "inspetor@tariel.test",
        ),
      pingApi: jest.fn().mockResolvedValue(true),
      removeToken: jest.fn(),
      CACHE_LEITURA_VAZIO: criarCacheVazio(),
      EMAIL_KEY: "tariel_inspetor_email",
      TOKEN_KEY: "tariel_inspetor_access_token",
      onSetStatusApi,
      onSetEmail,
      onSetFilaOffline,
      onSetNotificacoes,
      onSetCacheLeitura,
      onSetLaudosFixadosIds,
      onSetHistoricoOcultoIds,
      onMergeCacheBootstrap,
      onSetSession,
      onSetUsandoCacheOffline,
      onSetLaudosDisponiveis,
      onSetConversa,
      onSetMensagensMesa,
      onSetLaudoMesaCarregado,
      onSetErroLaudos,
    });

    expect(onSetStatusApi).toHaveBeenCalledWith("online");
    expect(onSetEmail).toHaveBeenCalledWith("inspetor@tariel.test");
    expect(onSetFilaOffline).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "offline-1",
        }),
      ]),
    );
    expect(onSetNotificacoes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "notif-1",
        }),
      ]),
    );
    expect(onSetLaudosFixadosIds).toHaveBeenCalledWith([10]);
    expect(onSetHistoricoOcultoIds).toHaveBeenCalledWith([11]);
    expect(onMergeCacheBootstrap).toHaveBeenCalledWith(bootstrap);
    expect(onSetUsandoCacheOffline).toHaveBeenCalledWith(false);
    expect(onSetSession).toHaveBeenCalledWith({
      accessToken: "token-online",
      bootstrap,
    });
    expect(onSetLaudosDisponiveis).not.toHaveBeenCalled();
    expect(onSetConversa).not.toHaveBeenCalled();
    expect(onSetMensagensMesa).not.toHaveBeenCalled();
    expect(onSetErroLaudos).not.toHaveBeenCalled();
  });

  it("faz fallback offline com cache local quando o bootstrap remoto falha", async () => {
    const bootstrap = criarBootstrapMock();
    const conversaCache: ChatState = {
      laudoId: 33,
      estado: "relatorio_ativo",
      statusCard: "ativo",
      permiteEdicao: true,
      permiteReabrir: false,
      laudoCard: null,
      modo: "detalhado",
      mensagens: [],
    };
    const laudosCache: MobileLaudoCard[] = [
      {
        id: 33,
        titulo: "Laudo offline",
        preview: "Resumo salvo",
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
      },
    ];
    const mesaCache: MobileMesaMessage[] = [
      {
        id: 91,
        laudo_id: 33,
        tipo: "humano_eng",
        texto: "Mensagem da mesa",
        remetente_id: 1,
        data: "2026-03-20 10:00",
        lida: false,
        resolvida_em: "",
        resolvida_em_label: "",
        resolvida_por_nome: "",
      },
    ];
    const cacheLocal: MobileReadCache = {
      bootstrap,
      laudos: laudosCache,
      conversaAtual: conversaCache,
      conversasPorLaudo: {},
      mesaPorLaudo: {
        "laudo:33": mesaCache,
      },
      chatDrafts: {},
      mesaDrafts: {},
      chatAttachmentDrafts: {},
      mesaAttachmentDrafts: {},
      updatedAt: "2026-03-20T10:00:00.000Z",
    };
    const onSetSession = jest.fn();
    const onSetLaudosDisponiveis = jest.fn();
    const onSetConversa = jest.fn();
    const onSetMensagensMesa = jest.fn();
    const onSetLaudoMesaCarregado = jest.fn();
    const onSetUsandoCacheOffline = jest.fn();
    const onSetErroLaudos = jest.fn();
    const removeToken = jest.fn();

    await runBootstrapAppFlow({
      aplicarPreferenciasLaudos: (itens) => itens,
      carregarBootstrapMobile: jest
        .fn()
        .mockRejectedValue(new Error("sem internet no bootstrap")),
      chaveCacheLaudo: (laudoId) => `laudo:${laudoId ?? "rascunho"}`,
      erroSugereModoOffline: () => true,
      chatHistoryEnabled: true,
      deviceBackupEnabled: true,
      lerCacheLeituraLocal: jest.fn().mockResolvedValue(cacheLocal),
      lerEstadoHistoricoLocal: jest.fn().mockResolvedValue({
        laudosFixadosIds: [],
        historicoOcultoIds: [],
      }),
      lerFilaOfflineLocal: jest.fn().mockResolvedValue([]),
      lerNotificacoesLocais: jest.fn().mockResolvedValue([]),
      limparCachePorPrivacidade: (cache) => cache,
      obterItemSeguro: jest
        .fn()
        .mockImplementation(async (key: string) =>
          key === "tariel_inspetor_access_token" ? "token-offline" : null,
        ),
      pingApi: jest.fn().mockResolvedValue(false),
      removeToken,
      CACHE_LEITURA_VAZIO: criarCacheVazio(),
      EMAIL_KEY: "tariel_inspetor_email",
      TOKEN_KEY: "tariel_inspetor_access_token",
      onSetStatusApi: jest.fn(),
      onSetEmail: jest.fn(),
      onSetFilaOffline: jest.fn(),
      onSetNotificacoes: jest.fn(),
      onSetCacheLeitura: jest.fn(),
      onSetLaudosFixadosIds: jest.fn(),
      onSetHistoricoOcultoIds: jest.fn(),
      onMergeCacheBootstrap: jest.fn(),
      onSetSession,
      onSetUsandoCacheOffline,
      onSetLaudosDisponiveis,
      onSetConversa,
      onSetMensagensMesa,
      onSetLaudoMesaCarregado,
      onSetErroLaudos,
    });

    expect(onSetSession).toHaveBeenCalledWith({
      accessToken: "token-offline",
      bootstrap,
    });
    expect(onSetLaudosDisponiveis).toHaveBeenCalledWith(laudosCache);
    expect(onSetConversa).toHaveBeenCalledWith(conversaCache);
    expect(onSetMensagensMesa).toHaveBeenCalledWith(mesaCache);
    expect(onSetLaudoMesaCarregado).toHaveBeenCalledWith(33);
    expect(onSetUsandoCacheOffline).toHaveBeenCalledWith(true);
    expect(onSetErroLaudos).not.toHaveBeenCalled();
    expect(removeToken).not.toHaveBeenCalled();
  });
});
