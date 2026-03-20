import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import type { Dispatch, SetStateAction } from "react";

import { pingApi } from "../../config/api";
import {
  listarEventosObservabilidade,
  resumirEventosObservabilidade,
} from "../../config/observability";
import {
  APP_BUILD_CHANNEL,
  READ_CACHE_FILE,
} from "../InspectorMobileApp.constants";
import { readNetworkSnapshot } from "../chat/network";
import type { ComposerAttachment } from "../chat/types";
import { clearLocalCache } from "../system/cacheControl";
import type {
  ConfirmSheetState,
  SettingsSheetState,
} from "./settingsSheetTypes";
import type {
  ExternalIntegration,
  SecurityEventItem,
  SupportQueueItem,
} from "./useSettingsPresentation";

type SettingsFileSecurityTopic = "validacao" | "urls" | "bloqueios";

interface AppRuntimeLike {
  versionLabel: string;
  buildLabel: string;
  updateStatusFallback: string;
}

interface CacheLike {
  bootstrap: unknown;
  updatedAt: string;
}

interface NetworkSnapshotLike {
  isWifi: boolean;
  typeLabel: string;
}

interface UseSettingsOperationsActionsParams<TCacheLeitura extends CacheLike> {
  appRuntime: AppRuntimeLike;
  cacheLeituraVazio: TCacheLeitura;
  canalSuporteUrl: string;
  emailAtualConta: string;
  eventosSeguranca: SecurityEventItem[];
  executarComReautenticacao: (motivo: string, onSuccess: () => void) => void;
  fallbackEmail: string;
  fecharConfiguracoes: () => void;
  filaOfflineTotal: number;
  filaSuporteLocal: SupportQueueItem[];
  formatarHorarioAtividade: (value: string) => string;
  handleLogout: () => Promise<void> | void;
  integracaoSincronizandoId: ExternalIntegration["id"] | "";
  integracoesExternas: ExternalIntegration[];
  limpandoCache: boolean;
  microfonePermitido: boolean;
  cameraPermitida: boolean;
  arquivosPermitidos: boolean;
  notificacoesPermitidas: boolean;
  abrirConfirmacaoConfiguracao: (config: ConfirmSheetState) => void;
  abrirSheetConfiguracao: (config: SettingsSheetState) => void;
  perfilExibicao: string;
  perfilNome: string;
  registrarEventoSegurancaLocal: (
    evento: Omit<SecurityEventItem, "id">,
  ) => void;
  resumoAtualizacaoApp: string;
  sessaoAtualTitulo: string;
  setBugAttachmentDraft: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setCacheLeitura: Dispatch<SetStateAction<TCacheLeitura>>;
  setFilaSuporteLocal: Dispatch<SetStateAction<SupportQueueItem[]>>;
  setIntegracaoSincronizandoId: Dispatch<
    SetStateAction<ExternalIntegration["id"] | "">
  >;
  setIntegracoesExternas: Dispatch<SetStateAction<ExternalIntegration[]>>;
  setLimpandoCache: Dispatch<SetStateAction<boolean>>;
  setSettingsSheetNotice: Dispatch<SetStateAction<string>>;
  setStatusApi: (value: "online" | "offline") => void;
  setStatusAtualizacaoApp: Dispatch<SetStateAction<string>>;
  setUltimaLimpezaCacheEm: Dispatch<SetStateAction<string>>;
  setUltimaVerificacaoAtualizacao: Dispatch<SetStateAction<string>>;
  setVerificandoAtualizacoes: Dispatch<SetStateAction<boolean>>;
  compartilharTextoExportado: (params: {
    extension: "txt";
    content: string;
    prefixo: string;
  }) => Promise<boolean>;
  statusApi: string;
  statusAtualizacaoApp: string;
  tentarAbrirUrlExterna: (url: string) => Promise<boolean>;
  ultimaVerificacaoAtualizacao: string;
  verificandoAtualizacoes: boolean;
  showAlert: (title: string, message?: string) => void;
  onNotificarSistema: (params: {
    title: string;
    body: string;
    kind?: "system" | "alerta_critico";
  }) => void;
  montarScreenshotAnexo: (
    asset: ImagePicker.ImagePickerAsset,
  ) => ComposerAttachment;
}

export function useSettingsOperationsActions<TCacheLeitura extends CacheLike>({
  appRuntime,
  cacheLeituraVazio,
  canalSuporteUrl,
  emailAtualConta,
  eventosSeguranca,
  executarComReautenticacao,
  fallbackEmail,
  fecharConfiguracoes,
  filaOfflineTotal,
  filaSuporteLocal,
  formatarHorarioAtividade,
  handleLogout,
  integracaoSincronizandoId,
  integracoesExternas,
  limpandoCache,
  microfonePermitido,
  cameraPermitida,
  arquivosPermitidos,
  notificacoesPermitidas,
  abrirConfirmacaoConfiguracao,
  abrirSheetConfiguracao,
  perfilExibicao,
  perfilNome,
  registrarEventoSegurancaLocal,
  resumoAtualizacaoApp,
  sessaoAtualTitulo,
  setBugAttachmentDraft,
  setCacheLeitura,
  setFilaSuporteLocal,
  setIntegracaoSincronizandoId,
  setIntegracoesExternas,
  setLimpandoCache,
  setSettingsSheetNotice,
  setStatusApi,
  setStatusAtualizacaoApp,
  setUltimaLimpezaCacheEm,
  setUltimaVerificacaoAtualizacao,
  setVerificandoAtualizacoes,
  compartilharTextoExportado,
  statusApi,
  statusAtualizacaoApp,
  tentarAbrirUrlExterna,
  ultimaVerificacaoAtualizacao,
  verificandoAtualizacoes,
  showAlert,
  onNotificarSistema,
  montarScreenshotAnexo,
}: UseSettingsOperationsActionsParams<TCacheLeitura>) {
  function handleSolicitarLogout() {
    abrirConfirmacaoConfiguracao({
      kind: "sessionCurrent",
      title: "Sair da conta",
      description:
        "Vamos encerrar a sessão atual, limpar tokens e voltar para a tela de login deste dispositivo.",
      confirmLabel: "Sair agora",
      onConfirm: () => {
        fecharConfiguracoes();
        void handleLogout();
      },
    });
  }

  function handleApagarHistoricoConfiguracoes() {
    executarComReautenticacao(
      "Confirme sua identidade para apagar o histórico salvo neste dispositivo.",
      () => {
        abrirConfirmacaoConfiguracao({
          kind: "clearHistory",
          title: "Apagar histórico",
          description:
            "Remove o histórico salvo localmente neste app. Você poderá sincronizar novamente depois.",
          confirmLabel: "Apagar histórico",
        });
      },
    );
  }

  function handleLimparTodasConversasConfig() {
    executarComReautenticacao(
      "Confirme sua identidade para excluir todas as conversas locais do inspetor.",
      () => {
        abrirConfirmacaoConfiguracao({
          kind: "clearConversations",
          title: "Limpar conversas",
          description:
            "Limpa a lista local de conversas do app. O backend poderá sincronizar tudo de novo depois.",
          confirmLabel: "Limpar conversas",
        });
      },
    );
  }

  function handleAlternarIntegracaoExterna(integration: ExternalIntegration) {
    const conectando = !integration.connected;
    const agora = conectando ? new Date().toISOString() : "";
    setIntegracoesExternas((estadoAtual: ExternalIntegration[]) =>
      estadoAtual.map((item) =>
        item.id === integration.id
          ? {
              ...item,
              connected: conectando,
              lastSyncAt: agora,
            }
          : item,
      ),
    );
    registrarEventoSegurancaLocal({
      title: conectando
        ? `${integration.label} conectada`
        : `${integration.label} desconectada`,
      meta: conectando
        ? "Integração habilitada nas configurações avançadas"
        : "Integração removida das configurações avançadas",
      status: "Agora",
      type: "provider",
    });
    setSettingsSheetNotice(
      conectando
        ? `${integration.label} conectada com sucesso.`
        : `${integration.label} desconectada deste dispositivo.`,
    );
  }

  async function handleSincronizarIntegracaoExterna(
    integration: ExternalIntegration,
  ) {
    if (!integration.connected) {
      setSettingsSheetNotice(
        `Conecte ${integration.label} antes de sincronizar.`,
      );
      return;
    }

    if (integracaoSincronizandoId) {
      return;
    }

    setIntegracaoSincronizandoId(integration.id);
    try {
      await new Promise((resolve) => setTimeout(resolve, 420));
      const agora = new Date().toISOString();
      setIntegracoesExternas((estadoAtual: ExternalIntegration[]) =>
        estadoAtual.map((item) =>
          item.id === integration.id
            ? {
                ...item,
                lastSyncAt: agora,
              }
            : item,
        ),
      );
      registrarEventoSegurancaLocal({
        title: `${integration.label} sincronizada`,
        meta: `Sincronização local concluída em ${formatarHorarioAtividade(agora)}`,
        status: "Agora",
        type: "data",
      });
      setSettingsSheetNotice(`${integration.label} sincronizada com sucesso.`);
    } finally {
      setIntegracaoSincronizandoId("");
    }
  }

  async function handleSelecionarScreenshotBug() {
    try {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted && permissao.accessPrivileges !== "limited") {
        setSettingsSheetNotice(
          "Permita acesso às imagens para anexar o screenshot do bug.",
        );
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        setSettingsSheetNotice("Seleção de screenshot cancelada.");
        return;
      }

      const screenshot = montarScreenshotAnexo(resultado.assets[0]);
      setBugAttachmentDraft(screenshot);
      setSettingsSheetNotice(
        `Screenshot "${screenshot.label}" anexada ao relato.`,
      );
    } catch (error) {
      setSettingsSheetNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível anexar o screenshot agora.",
      );
    }
  }

  function handleRemoverScreenshotBug() {
    setBugAttachmentDraft(null);
    setSettingsSheetNotice("Screenshot removida do relato.");
  }

  function handleDetalhesSegurancaArquivos(topico: SettingsFileSecurityTopic) {
    if (topico === "validacao") {
      showAlert(
        "Validação de upload",
        "O app valida tipo e tamanho no cliente, e o backend valida novamente antes de aceitar o arquivo.",
      );
      return;
    }
    if (topico === "urls") {
      showAlert(
        "URLs protegidas",
        "Os anexos são servidos com autorização de sessão. Sem token válido, o arquivo não é aberto no app.",
      );
      return;
    }
    showAlert(
      "Falhas e bloqueios",
      "Quando o upload falha, o app mostra feedback e permite retomar pela fila offline sem perder contexto.",
    );
  }

  async function handleVerificarAtualizacoes() {
    if (verificandoAtualizacoes) {
      return;
    }

    setVerificandoAtualizacoes(true);
    try {
      const [online, networkSnapshot] = await Promise.all([
        pingApi(),
        readNetworkSnapshot(),
      ]);
      const snapshot = networkSnapshot as NetworkSnapshotLike;
      setStatusApi(online ? "online" : "offline");
      const verificadoEm = new Date().toISOString();
      setUltimaVerificacaoAtualizacao(verificadoEm);
      const status = online
        ? `${appRuntime.updateStatusFallback} Rede atual: ${snapshot.isWifi ? "Wi-Fi" : snapshot.typeLabel}.`
        : "Sem conexão para verificar a disponibilidade de atualização nesta build.";
      setStatusAtualizacaoApp(status);
      onNotificarSistema({
        title: "Atualizações verificadas",
        body: status,
      });
      abrirSheetConfiguracao({
        kind: "updates",
        title: "Verificar atualizações",
        subtitle: `Versão instalada ${appRuntime.versionLabel} • ${appRuntime.buildLabel}.`,
        actionLabel: "Verificar agora",
      });
    } finally {
      setVerificandoAtualizacoes(false);
    }
  }

  async function handleLimparCache() {
    if (limpandoCache) {
      return;
    }

    setLimpandoCache(true);
    try {
      const baseCacheDir =
        FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
      const resultado = await clearLocalCache([
        READ_CACHE_FILE,
        `${baseCacheDir}tariel-anexos`,
        `${baseCacheDir}tariel-exports`,
      ]);
      setCacheLeitura((estadoAtual: TCacheLeitura) => ({
        ...cacheLeituraVazio,
        bootstrap: estadoAtual.bootstrap,
        updatedAt: "",
      }));
      setUltimaLimpezaCacheEm(new Date().toISOString());
      onNotificarSistema({
        title: "Cache limpo",
        body: `${resultado.removedCount} item(ns) temporário(s) removido(s) do dispositivo.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível limpar o cache local.";
      onNotificarSistema({
        kind: "alerta_critico",
        title: "Falha ao limpar cache",
        body: message,
      });
      showAlert("Cache", message);
    } finally {
      setLimpandoCache(false);
    }
  }

  function handleAbrirCanalSuporte() {
    if (!canalSuporteUrl) {
      showAlert(
        "Suporte",
        "Nenhum canal de suporte operacional foi publicado para esta conta.",
      );
      return;
    }
    void (async () => {
      const abriu = await tentarAbrirUrlExterna(canalSuporteUrl);
      if (!abriu) {
        showAlert(
          "Suporte",
          "Não foi possível abrir o canal de suporte agora.",
        );
      }
    })();
  }

  async function handleExportarDiagnosticoApp() {
    const eventosObservabilidade = await listarEventosObservabilidade(80);
    const resumoObservabilidade = resumirEventosObservabilidade(
      eventosObservabilidade,
    );
    const payload = [
      "Tariel Inspetor - Diagnóstico local",
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      `Build: ${appRuntime.versionLabel} (${appRuntime.buildLabel}) • ${APP_BUILD_CHANNEL}`,
      `API: ${statusApi === "online" ? "online" : "offline"}`,
      `Conta: ${perfilNome || perfilExibicao || "Inspetor"}`,
      `Email: ${emailAtualConta || fallbackEmail || "Sem email"}`,
      `Sessão atual: ${sessaoAtualTitulo || "Dispositivo atual"}`,
      `Fila offline: ${filaOfflineTotal} item(ns)`,
      `Fila de suporte: ${filaSuporteLocal.length} item(ns)`,
      `Fila de suporte com anexo: ${filaSuporteLocal.filter((item) => Boolean(item.attachmentUri)).length} item(ns)`,
      `Integrações conectadas: ${integracoesExternas.filter((item) => item.connected).length}/${integracoesExternas.length}`,
      `Observabilidade: ${resumoObservabilidade.total} evento(s) / ${resumoObservabilidade.failures} falha(s)`,
      `Observabilidade (último evento): ${resumoObservabilidade.latestAt ? formatarHorarioAtividade(resumoObservabilidade.latestAt) : "nenhum"}`,
      `Observabilidade (latência média): ${resumoObservabilidade.averageDurationMs} ms`,
      `Observabilidade (por tipo): api=${resumoObservabilidade.byKind.api}, fila=${resumoObservabilidade.byKind.offline_queue}, atividade=${resumoObservabilidade.byKind.activity_monitor}, push=${resumoObservabilidade.byKind.push}`,
      `Observabilidade (falhas por tipo): api=${resumoObservabilidade.failuresByKind.api}, fila=${resumoObservabilidade.failuresByKind.offline_queue}, atividade=${resumoObservabilidade.failuresByKind.activity_monitor}, push=${resumoObservabilidade.failuresByKind.push}`,
      `Última verificação de atualização: ${ultimaVerificacaoAtualizacao ? formatarHorarioAtividade(ultimaVerificacaoAtualizacao) : "nunca"}`,
      `Status da atualização: ${statusAtualizacaoApp}`,
      `Resumo atualização: ${resumoAtualizacaoApp}`,
      `Permissões: ${[microfonePermitido ? "microfone" : "", cameraPermitida ? "câmera" : "", arquivosPermitidos ? "arquivos" : "", notificacoesPermitidas ? "notificações" : ""].filter(Boolean).join(", ") || "nenhuma ativa"}`,
      "",
      "Eventos recentes de segurança:",
      ...eventosSeguranca
        .slice(0, 5)
        .map((item) => `- ${item.title} • ${item.status} • ${item.meta}`),
    ].join("\n");

    const exportado = await compartilharTextoExportado({
      extension: "txt",
      content: payload,
      prefixo: "tariel-inspetor-diagnostico",
    });
    if (exportado) {
      registrarEventoSegurancaLocal({
        title: "Diagnóstico exportado",
        meta: "Pacote textual compartilhado pelo fluxo de suporte",
        status: "Agora",
        type: "data",
      });
      return;
    }
    setSettingsSheetNotice(
      "Não foi possível compartilhar o diagnóstico agora.",
    );
  }

  function handleLimparFilaSuporteLocal() {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Limpar fila local de suporte",
      description:
        "Remove os relatos de bug e feedback guardados apenas neste dispositivo. O histórico de segurança permanece intacto.",
      confirmLabel: "Limpar fila",
      onConfirm: () => {
        setFilaSuporteLocal([]);
        registrarEventoSegurancaLocal({
          title: "Fila local de suporte limpa",
          meta: "Relatos locais removidos pelo usuário",
          status: "Agora",
          type: "data",
        });
      },
    });
  }

  return {
    handleSolicitarLogout,
    handleApagarHistoricoConfiguracoes,
    handleLimparTodasConversasConfig,
    handleAlternarIntegracaoExterna,
    handleSincronizarIntegracaoExterna,
    handleSelecionarScreenshotBug,
    handleRemoverScreenshotBug,
    handleDetalhesSegurancaArquivos,
    handleVerificarAtualizacoes,
    handleLimparCache,
    handleAbrirCanalSuporte,
    handleExportarDiagnosticoApp,
    handleLimparFilaSuporteLocal,
  };
}
