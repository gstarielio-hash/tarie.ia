import type { Dispatch, SetStateAction } from "react";
import { Vibration } from "react-native";

import { registrarEventoObservabilidade } from "../../config/observability";
import type { ComposerAttachment, OfflinePendingMessage } from "../chat/types";
import { stopSpeechPlayback } from "../chat/voice";
import { requestDevicePermission } from "../system/permissions";
import type { ConfirmSheetState } from "./settingsSheetTypes";
import type { SecurityEventItem } from "./useSettingsPresentation";

interface CacheLike {
  bootstrap: unknown;
  updatedAt: string;
}

interface UseSettingsToggleActionsParams<TCacheLeitura extends CacheLike> {
  arquivosPermitidos: boolean;
  cacheLeituraVazio: TCacheLeitura;
  cameraPermitida: boolean;
  executarComReautenticacao: (motivo: string, onSuccess: () => void) => void;
  filaOffline: OfflinePendingMessage[];
  microfonePermitido: boolean;
  notificacoesPermitidas: boolean;
  sessionAccessToken: string | null;
  statusApi: "checking" | "online" | "offline";
  abrirConfirmacaoConfiguracao: (config: ConfirmSheetState) => void;
  handleExportarDados: (formato: "JSON" | "PDF" | "TXT") => Promise<void>;
  onIsOfflineItemReadyForRetry: (item: OfflinePendingMessage) => boolean;
  onOpenSystemSettings: () => void;
  onSaveReadCacheLocally: (cache: TCacheLeitura) => Promise<void>;
  onSetSettingsSheetNotice: (value: string) => void;
  onSyncOfflineQueue: (
    accessToken: string,
    automatic?: boolean,
  ) => Promise<void>;
  registrarEventoSegurancaLocal: (
    evento: Omit<SecurityEventItem, "id">,
  ) => void;
  setAnexoMesaRascunho: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setAnexoRascunho: Dispatch<SetStateAction<ComposerAttachment | null>>;
  setArquivosPermitidos: (value: boolean) => void;
  setBackupAutomatico: (value: boolean) => void;
  setEntradaPorVoz: (value: boolean) => void;
  setMicrofonePermitido: (value: boolean) => void;
  setMostrarConteudoNotificacao: (value: boolean) => void;
  setMostrarSomenteNovaMensagem: (value: boolean) => void;
  setNotificaPush: (value: boolean) => void;
  setNotificacoesPermitidas: (value: boolean) => void;
  setOcultarConteudoBloqueado: (value: boolean) => void;
  setRespostaPorVoz: (value: boolean) => void;
  setSpeechEnabled: (value: boolean) => void;
  setSincronizacaoDispositivos: (value: boolean) => void;
  setUploadArquivosAtivo: (value: boolean) => void;
  setVibracaoAtiva: (value: boolean) => void;
  voiceInputRuntimeSupported: boolean;
  voiceInputUnavailableMessage: string;
  showAlert: (
    title: string,
    message?: string,
    buttons?: Array<{
      text: string;
      style?: "default" | "cancel" | "destructive";
      onPress?: () => void;
    }>,
  ) => void;
}

export function useSettingsToggleActions<TCacheLeitura extends CacheLike>({
  arquivosPermitidos,
  cacheLeituraVazio,
  cameraPermitida,
  executarComReautenticacao,
  filaOffline,
  microfonePermitido,
  notificacoesPermitidas,
  sessionAccessToken,
  statusApi,
  abrirConfirmacaoConfiguracao,
  handleExportarDados,
  onIsOfflineItemReadyForRetry,
  onOpenSystemSettings,
  onSaveReadCacheLocally,
  onSetSettingsSheetNotice,
  onSyncOfflineQueue,
  registrarEventoSegurancaLocal,
  setAnexoMesaRascunho,
  setAnexoRascunho,
  setArquivosPermitidos,
  setBackupAutomatico,
  setEntradaPorVoz,
  setMicrofonePermitido,
  setMostrarConteudoNotificacao,
  setMostrarSomenteNovaMensagem,
  setNotificaPush,
  setNotificacoesPermitidas,
  setOcultarConteudoBloqueado,
  setRespostaPorVoz,
  setSpeechEnabled,
  setSincronizacaoDispositivos,
  setUploadArquivosAtivo,
  setVibracaoAtiva,
  voiceInputRuntimeSupported,
  voiceInputUnavailableMessage,
  showAlert,
}: UseSettingsToggleActionsParams<TCacheLeitura>) {
  function handleToggleBackupAutomatico(value: boolean) {
    setBackupAutomatico(value);
    if (!value) {
      void onSaveReadCacheLocally(cacheLeituraVazio);
      registrarEventoSegurancaLocal({
        title: "Backup automático desativado",
        meta: "O cache de leitura local foi limpo e novos backups automáticos foram pausados.",
        status: "Agora",
        type: "data",
      });
      return;
    }
    registrarEventoSegurancaLocal({
      title: "Backup automático ativado",
      meta: "O app voltará a persistir cache local de leitura automaticamente.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleSincronizacaoDispositivos(value: boolean) {
    setSincronizacaoDispositivos(value);
    if (!value) {
      registrarEventoSegurancaLocal({
        title: "Sincronização entre dispositivos desativada",
        meta: "Monitoramento em segundo plano e sincronização automática da fila offline foram pausados.",
        status: "Agora",
        type: "session",
      });
      return;
    }
    registrarEventoSegurancaLocal({
      title: "Sincronização entre dispositivos ativada",
      meta: "Monitoramento automático do app e sincronização de pendências foram reativados.",
      status: "Agora",
      type: "session",
    });
    if (
      sessionAccessToken &&
      statusApi === "online" &&
      filaOffline.some((item) => onIsOfflineItemReadyForRetry(item))
    ) {
      void onSyncOfflineQueue(sessionAccessToken, true);
    }
  }

  async function handleToggleUploadArquivos(value: boolean) {
    if (!value) {
      setUploadArquivosAtivo(false);
      setAnexoRascunho(null);
      setAnexoMesaRascunho(null);
      registrarEventoSegurancaLocal({
        title: "Upload de arquivos desativado",
        meta: "Anexos foram bloqueados no composer e rascunhos de anexo foram removidos.",
        status: "Agora",
        type: "data",
      });
      return;
    }

    const permitido =
      arquivosPermitidos || (await requestDevicePermission("files"));
    setArquivosPermitidos(permitido);
    if (!permitido) {
      setUploadArquivosAtivo(false);
      showAlert(
        "Permissão necessária",
        "Libere o acesso a arquivos no Android para anexar documentos e imagens no app.",
        [
          { text: "Agora não", style: "cancel" },
          {
            text: "Abrir ajustes",
            onPress: onOpenSystemSettings,
          },
        ],
      );
      return;
    }

    setUploadArquivosAtivo(true);
    registrarEventoSegurancaLocal({
      title: "Upload de arquivos ativado",
      meta: "Anexos de imagem e documento liberados no fluxo de conversa.",
      status: "Agora",
      type: "data",
    });
  }

  async function handleToggleEntradaPorVoz(value: boolean) {
    if (!value) {
      setEntradaPorVoz(false);
      registrarEventoSegurancaLocal({
        title: "Entrada por voz desativada",
        meta: "Comandos por voz foram desativados neste dispositivo.",
        status: "Agora",
        type: "data",
      });
      return;
    }

    const permitido =
      microfonePermitido || (await requestDevicePermission("microphone"));
    setMicrofonePermitido(permitido);
    if (!permitido) {
      setEntradaPorVoz(false);
      showAlert(
        "Permissão necessária",
        "Ative a permissão de microfone no Android para usar entrada por voz no app.",
        [
          { text: "Agora não", style: "cancel" },
          {
            text: "Abrir ajustes",
            onPress: onOpenSystemSettings,
          },
        ],
      );
      return;
    }

    setEntradaPorVoz(true);
    registrarEventoSegurancaLocal({
      title: "Entrada por voz ativada",
      meta: "O app está autorizado a receber comandos por voz quando disponíveis no dispositivo.",
      status: "Agora",
      type: "data",
    });
    if (!voiceInputRuntimeSupported) {
      onSetSettingsSheetNotice(voiceInputUnavailableMessage);
    }
  }

  function handleToggleSpeechEnabled(value: boolean) {
    setSpeechEnabled(value);
    if (!value) {
      void stopSpeechPlayback();
    }
    registrarEventoSegurancaLocal({
      title: value
        ? "Preferências de fala ativadas"
        : "Preferências de fala desativadas",
      meta: value
        ? "O dispositivo volta a permitir preferências locais de voz e transcrição."
        : "Os atalhos locais de fala foram pausados neste dispositivo.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleRespostaPorVoz(value: boolean) {
    setRespostaPorVoz(value);
    if (!value) {
      void stopSpeechPlayback();
    }
    registrarEventoSegurancaLocal({
      title: "Resposta por voz atualizada",
      meta: value
        ? "O app poderá usar síntese de voz quando o recurso estiver disponível no dispositivo."
        : "Saída por voz desativada neste dispositivo.",
      status: "Agora",
      type: "data",
    });
  }

  async function handleToggleNotificaPush(value: boolean) {
    if (!value) {
      setNotificaPush(false);
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_toggle",
        ok: true,
        detail: "disabled",
      });
      return;
    }

    const permitido =
      notificacoesPermitidas ||
      (await requestDevicePermission("notifications"));
    setNotificacoesPermitidas(permitido);
    if (permitido) {
      setNotificaPush(true);
      void registrarEventoObservabilidade({
        kind: "push",
        name: "push_toggle",
        ok: true,
        detail: "enabled",
      });
      return;
    }

    setNotificaPush(false);
    void registrarEventoObservabilidade({
      kind: "push",
      name: "push_toggle",
      ok: false,
      detail: "permission_denied",
    });
    showAlert(
      "Permissão necessária",
      "Ative as notificações do sistema para habilitar alertas push no app.",
      [
        { text: "Agora não", style: "cancel" },
        {
          text: "Abrir ajustes",
          onPress: onOpenSystemSettings,
        },
      ],
    );
  }

  function handleToggleVibracao(value: boolean) {
    setVibracaoAtiva(value);
    if (value) {
      Vibration.vibrate(24);
    }
    registrarEventoSegurancaLocal({
      title: "Vibração do app atualizada",
      meta: value
        ? "Feedback tátil ativado nas ações do aplicativo."
        : "Feedback tátil desativado.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleMostrarConteudoNotificacao(value: boolean) {
    setMostrarConteudoNotificacao(value);
    if (value) {
      setMostrarSomenteNovaMensagem(false);
    }
    registrarEventoSegurancaLocal({
      title: "Prévia de notificação atualizada",
      meta: value
        ? "Conteúdo das mensagens pode aparecer quando o sistema permitir."
        : "Conteúdo textual das mensagens ficou oculto nas notificações.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleOcultarConteudoBloqueado(value: boolean) {
    setOcultarConteudoBloqueado(value);
    registrarEventoSegurancaLocal({
      title: "Privacidade na tela bloqueada atualizada",
      meta: value
        ? "Conteúdo sensível oculto na tela bloqueada."
        : "O app permite prévias fora da tela bloqueada, conforme o sistema.",
      status: "Agora",
      type: "data",
    });
  }

  function handleToggleMostrarSomenteNovaMensagem(value: boolean) {
    setMostrarSomenteNovaMensagem(value);
    if (value) {
      setMostrarConteudoNotificacao(false);
      setOcultarConteudoBloqueado(true);
    }
    registrarEventoSegurancaLocal({
      title: "Modo privado de notificação atualizado",
      meta: value
        ? 'As notificações exibem apenas "Nova mensagem".'
        : "O app voltou a permitir outros níveis de prévia.",
      status: "Agora",
      type: "data",
    });
  }

  function handleRevisarPermissoesCriticas() {
    const faltando = [
      !cameraPermitida ? "câmera" : "",
      !arquivosPermitidos ? "arquivos" : "",
      !notificacoesPermitidas ? "notificações" : "",
    ].filter(Boolean);
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Revisar permissões críticas",
      description: faltando.length
        ? `Ainda faltam ${faltando.join(", ")} para o app operar melhor em campo. Vamos abrir os ajustes do Android.`
        : "As permissões críticas já estão liberadas. Você ainda pode revisar tudo nos ajustes do Android.",
      confirmLabel: "Abrir ajustes",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Revisão de permissões críticas",
          meta: faltando.length
            ? `Pendentes: ${faltando.join(", ")}`
            : "Todas as permissões críticas já estavam liberadas",
          status: "Agora",
          type: "session",
        });
        onOpenSystemSettings();
      },
    });
  }

  function handleExportarAntesDeExcluirConta() {
    executarComReautenticacao(
      "Confirme sua identidade para exportar os dados antes da exclusão permanente da conta.",
      () => {
        void handleExportarDados("JSON");
      },
    );
  }

  function handleReportarAtividadeSuspeita() {
    abrirConfirmacaoConfiguracao({
      kind: "security",
      title: "Reportar atividade suspeita",
      description:
        "Esse evento será marcado como crítico no histórico de segurança do inspetor e usado para revisão posterior.",
      confirmLabel: "Reportar",
      onConfirm: () => {
        registrarEventoSegurancaLocal({
          title: "Atividade suspeita reportada",
          meta: "O usuário sinalizou uma ocorrência no histórico de segurança",
          status: "Agora",
          type: "session",
          critical: true,
        });
      },
    });
  }

  return {
    handleToggleBackupAutomatico,
    handleToggleSincronizacaoDispositivos,
    handleToggleUploadArquivos,
    handleToggleEntradaPorVoz,
    handleToggleSpeechEnabled,
    handleToggleRespostaPorVoz,
    handleToggleNotificaPush,
    handleToggleVibracao,
    handleToggleMostrarConteudoNotificacao,
    handleToggleOcultarConteudoBloqueado,
    handleToggleMostrarSomenteNovaMensagem,
    handleRevisarPermissoesCriticas,
    handleExportarAntesDeExcluirConta,
    handleReportarAtividadeSuspeita,
  };
}
