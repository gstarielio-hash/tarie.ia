import type { MobileBootstrapResponse } from "../../types/mobile";
import type {
  MobileActivityNotification,
  OfflinePendingMessage,
} from "../chat/types";
import {
  buildInspectorSessionModalCallbacks,
  buildInspectorSessionModalState,
} from "./buildInspectorSessionModalsSections";

function criarBootstrap(): MobileBootstrapResponse {
  return {
    ok: true,
    app: {
      nome: "Tariel Inspetor",
      portal: "inspetor",
      api_base_url: "https://api.tariel.test",
      suporte_whatsapp: "",
    },
    usuario: {
      id: 7,
      nome_completo: "Inspetor Tariel",
      email: "inspetor@tariel.test",
      telefone: "(11) 99999-0000",
      foto_perfil_url: "",
      empresa_nome: "Tariel",
      empresa_id: 3,
      nivel_acesso: 5,
    },
  };
}

function criarPendencia(id: string): OfflinePendingMessage {
  return {
    id,
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
  };
}

function criarNotificacao(id: string): MobileActivityNotification {
  return {
    id,
    kind: "status",
    laudoId: null,
    title: "Atualização",
    body: "Há uma atualização.",
    createdAt: "2026-03-20T10:00:00.000Z",
    unread: true,
    targetThread: "chat",
  };
}

describe("buildInspectorSessionModalsSections", () => {
  it("monta o estado visual dos modais com preview e lock do app", () => {
    const state = buildInspectorSessionModalState({
      anexosAberto: true,
      bloqueioAppAtivo: true,
      centralAtividadeAberta: true,
      confirmSheet: {
        kind: "security",
        title: "Confirmar ação",
        description: "Confirme a operação",
        confirmLabel: "Confirmar",
      },
      confirmTextDraft: "CONFIRMAR",
      detalheStatusPendenciaOffline: jest.fn().mockReturnValue("Backoff"),
      deviceBiometricsEnabled: true,
      filaOfflineAberta: true,
      filaOfflineFiltrada: [criarPendencia("1")],
      filaOfflineOrdenada: [criarPendencia("1"), criarPendencia("2")],
      filtroFilaOffline: "all",
      filtrosFilaOffline: [{ key: "all", label: "Tudo", count: 2 }],
      formatarHorarioAtividade: jest.fn(),
      iconePendenciaOffline: jest.fn(),
      legendaPendenciaOffline: jest.fn(),
      monitorandoAtividade: true,
      notificacoes: [criarNotificacao("n-1")],
      pendenciaFilaProntaParaReenvio: jest.fn(),
      podeSincronizarFilaOffline: true,
      previewAnexoImagem: {
        titulo: "evidencia",
        uri: "file:///evidencia.png",
      },
      renderSettingsSheetBody: jest.fn(),
      resumoFilaOfflineFiltrada: "2 pendências",
      resumoPendenciaOffline: jest.fn(),
      rotuloStatusPendenciaOffline: jest.fn(),
      session: { accessToken: "token-123", bootstrap: criarBootstrap() },
      settingsSheet: {
        kind: "profile",
        title: "Perfil",
        subtitle: "Atualize seus dados",
      },
      settingsSheetLoading: false,
      settingsSheetNotice: "",
      sincronizacaoDispositivos: true,
      sincronizandoFilaOffline: false,
      sincronizandoItemFilaId: "",
      statusApi: "online",
    });

    expect(state.appLockVisible).toBe(true);
    expect(state.activityCenterVisible).toBe(true);
    expect(state.attachmentPreviewAccessToken).toBe("token-123");
    expect(state.attachmentPreviewTitle).toBe("evidencia");
    expect(state.filaOfflineOrdenadaTotal).toBe(2);
    expect(state.settingsSheetVisible).toBe(true);
  });

  it("wiring dos callbacks usa o token da sessao ao sincronizar a fila", () => {
    const setFiltroFilaOffline = jest.fn();
    const sincronizarFilaOffline = jest.fn();

    const callbacks = buildInspectorSessionModalCallbacks({
      fecharConfirmacaoConfiguracao: jest.fn(),
      fecharSheetConfiguracao: jest.fn(),
      handleAbrirNotificacao: jest.fn(),
      handleConfirmarAcaoCritica: jest.fn(),
      handleConfirmarSettingsSheet: jest.fn(),
      handleDesbloquearAplicativo: jest.fn(),
      handleEscolherAnexo: jest.fn(),
      handleLogout: jest.fn(),
      handleRetomarItemFilaOffline: jest.fn(),
      removerItemFilaOffline: jest.fn(),
      session: { accessToken: "token-abc", bootstrap: criarBootstrap() },
      setAnexosAberto: jest.fn(),
      setCentralAtividadeAberta: jest.fn(),
      setConfirmTextDraft: jest.fn(),
      setFilaOfflineAberta: jest.fn(),
      setFiltroFilaOffline,
      setPreviewAnexoImagem: jest.fn(),
      sincronizarFilaOffline,
      sincronizarItemFilaOffline: jest.fn(),
    });

    callbacks.onSetFiltroFilaOffline("chat");
    callbacks.onSincronizarFilaOffline();

    expect(setFiltroFilaOffline).toHaveBeenCalledWith("chat");
    expect(sincronizarFilaOffline).toHaveBeenCalledWith("token-abc");
  });
});
