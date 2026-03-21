import type { AppSettings } from "../../settings/schema/types";
import { clearPersistedAccountData } from "../session/sessionStorage";
import type { ValueSetter } from "./settingsBuilderTypes";

interface BuildAccountDeletionActionParams {
  fecharConfiguracoes: () => void;
  handleLogout: () => Promise<void> | void;
  onResetSettingsPresentationAfterAccountDeletion: () => void;
  onSetAppLoading: ValueSetter<boolean>;
  onSetAprendizadoIa: ValueSetter<AppSettings["ai"]["learningOptIn"]>;
  onSetAnimacoesAtivas: ValueSetter<
    AppSettings["appearance"]["animationsEnabled"]
  >;
  onSetArquivosPermitidos: ValueSetter<
    AppSettings["security"]["filesPermission"]
  >;
  onSetAutoUploadAttachments: ValueSetter<
    AppSettings["dataControls"]["autoUploadAttachments"]
  >;
  onSetBackupAutomatico: ValueSetter<
    AppSettings["dataControls"]["deviceBackupEnabled"]
  >;
  onSetBiometriaPermitida: ValueSetter<
    AppSettings["security"]["biometricsPermission"]
  >;
  onSetCameraPermitida: ValueSetter<
    AppSettings["security"]["cameraPermission"]
  >;
  onSetChatCategoryEnabled: ValueSetter<
    AppSettings["notifications"]["chatCategoryEnabled"]
  >;
  onSetCompartilharMelhoriaIa: ValueSetter<boolean>;
  onSetCorDestaque: ValueSetter<AppSettings["appearance"]["accentColor"]>;
  onSetCriticalAlertsEnabled: ValueSetter<
    AppSettings["notifications"]["criticalAlertsEnabled"]
  >;
  onSetDensidadeInterface: ValueSetter<AppSettings["appearance"]["density"]>;
  onSetDeviceBiometricsEnabled: ValueSetter<
    AppSettings["security"]["deviceBiometricsEnabled"]
  >;
  onSetEconomiaDados: ValueSetter<AppSettings["system"]["dataSaver"]>;
  onSetEmail: ValueSetter<string>;
  onSetEmailAtualConta: ValueSetter<AppSettings["account"]["email"]>;
  onSetEmailsAtivos: ValueSetter<AppSettings["notifications"]["emailEnabled"]>;
  onSetEntradaPorVoz: ValueSetter<AppSettings["speech"]["autoTranscribe"]>;
  onSetEstiloResposta: ValueSetter<AppSettings["ai"]["responseStyle"]>;
  onSetFixarConversas: ValueSetter<boolean>;
  onSetHideInMultitask: ValueSetter<AppSettings["security"]["hideInMultitask"]>;
  onSetHistoricoOcultoIds: ValueSetter<number[]>;
  onSetIdiomaApp: ValueSetter<AppSettings["system"]["language"]>;
  onSetIdiomaResposta: ValueSetter<AppSettings["ai"]["responseLanguage"]>;
  onSetLaudosFixadosIds: ValueSetter<number[]>;
  onSetLockTimeout: ValueSetter<AppSettings["security"]["lockTimeout"]>;
  onSetMediaCompression: ValueSetter<
    AppSettings["dataControls"]["mediaCompression"]
  >;
  onSetMemoriaIa: ValueSetter<AppSettings["ai"]["memoryEnabled"]>;
  onSetMesaCategoryEnabled: ValueSetter<
    AppSettings["notifications"]["mesaCategoryEnabled"]
  >;
  onSetMicrofonePermitido: ValueSetter<
    AppSettings["security"]["microphonePermission"]
  >;
  onSetModeloIa: ValueSetter<AppSettings["ai"]["model"]>;
  onSetMostrarConteudoNotificacao: ValueSetter<
    AppSettings["notifications"]["showMessageContent"]
  >;
  onSetMostrarSomenteNovaMensagem: ValueSetter<
    AppSettings["notifications"]["onlyShowNewMessage"]
  >;
  onSetNomeAutomaticoConversas: ValueSetter<boolean>;
  onSetNotificaPush: ValueSetter<AppSettings["notifications"]["pushEnabled"]>;
  onSetNotificaRespostas: ValueSetter<
    AppSettings["notifications"]["responseAlertsEnabled"]
  >;
  onSetNotificacoesPermitidas: ValueSetter<
    AppSettings["security"]["notificationsPermission"]
  >;
  onSetOcultarConteudoBloqueado: ValueSetter<
    AppSettings["notifications"]["hideContentOnLockScreen"]
  >;
  onSetPerfilExibicao: ValueSetter<AppSettings["account"]["displayName"]>;
  onSetPerfilFotoHint: ValueSetter<AppSettings["account"]["photoHint"]>;
  onSetPerfilFotoUri: ValueSetter<AppSettings["account"]["photoUri"]>;
  onSetPerfilNome: ValueSetter<AppSettings["account"]["fullName"]>;
  onSetPreferredVoiceId: ValueSetter<AppSettings["speech"]["voiceId"]>;
  onSetRegiaoApp: ValueSetter<AppSettings["system"]["region"]>;
  onSetRequireAuthOnOpen: ValueSetter<
    AppSettings["security"]["requireAuthOnOpen"]
  >;
  onSetRespostaPorVoz: ValueSetter<AppSettings["speech"]["autoReadResponses"]>;
  onSetRetencaoDados: ValueSetter<AppSettings["dataControls"]["retention"]>;
  onSetSalvarHistoricoConversas: ValueSetter<
    AppSettings["dataControls"]["chatHistoryEnabled"]
  >;
  onSetSincronizacaoDispositivos: ValueSetter<
    AppSettings["dataControls"]["crossDeviceSyncEnabled"]
  >;
  onSetSomNotificacao: ValueSetter<AppSettings["notifications"]["soundPreset"]>;
  onSetSpeechRate: ValueSetter<AppSettings["speech"]["speechRate"]>;
  onSetSystemCategoryEnabled: ValueSetter<
    AppSettings["notifications"]["systemCategoryEnabled"]
  >;
  onSetTamanhoFonte: ValueSetter<AppSettings["appearance"]["fontScale"]>;
  onSetTemperaturaIa: ValueSetter<AppSettings["ai"]["temperature"]>;
  onSetTemaApp: ValueSetter<AppSettings["appearance"]["theme"]>;
  onSetTomConversa: ValueSetter<AppSettings["ai"]["tone"]>;
  onSetUploadArquivosAtivo: ValueSetter<AppSettings["attachments"]["enabled"]>;
  onSetUsoBateria: ValueSetter<AppSettings["system"]["batteryMode"]>;
  onSetVibracaoAtiva: ValueSetter<
    AppSettings["notifications"]["vibrationEnabled"]
  >;
  onSetVoiceLanguage: ValueSetter<AppSettings["speech"]["voiceLanguage"]>;
  onShowAlert: (title: string, message?: string) => void;
}

export function buildAccountDeletionAction({
  fecharConfiguracoes,
  handleLogout,
  onResetSettingsPresentationAfterAccountDeletion,
  onSetAppLoading,
  onSetAprendizadoIa,
  onSetAnimacoesAtivas,
  onSetArquivosPermitidos,
  onSetAutoUploadAttachments,
  onSetBackupAutomatico,
  onSetBiometriaPermitida,
  onSetCameraPermitida,
  onSetChatCategoryEnabled,
  onSetCompartilharMelhoriaIa,
  onSetCorDestaque,
  onSetCriticalAlertsEnabled,
  onSetDensidadeInterface,
  onSetDeviceBiometricsEnabled,
  onSetEconomiaDados,
  onSetEmail,
  onSetEmailAtualConta,
  onSetEmailsAtivos,
  onSetEntradaPorVoz,
  onSetEstiloResposta,
  onSetFixarConversas,
  onSetHideInMultitask,
  onSetHistoricoOcultoIds,
  onSetIdiomaApp,
  onSetIdiomaResposta,
  onSetLaudosFixadosIds,
  onSetLockTimeout,
  onSetMediaCompression,
  onSetMemoriaIa,
  onSetMesaCategoryEnabled,
  onSetMicrofonePermitido,
  onSetModeloIa,
  onSetMostrarConteudoNotificacao,
  onSetMostrarSomenteNovaMensagem,
  onSetNomeAutomaticoConversas,
  onSetNotificaPush,
  onSetNotificaRespostas,
  onSetNotificacoesPermitidas,
  onSetOcultarConteudoBloqueado,
  onSetPerfilExibicao,
  onSetPerfilFotoHint,
  onSetPerfilFotoUri,
  onSetPerfilNome,
  onSetPreferredVoiceId,
  onSetRegiaoApp,
  onSetRequireAuthOnOpen,
  onSetRespostaPorVoz,
  onSetRetencaoDados,
  onSetSalvarHistoricoConversas,
  onSetSincronizacaoDispositivos,
  onSetSomNotificacao,
  onSetSpeechRate,
  onSetSystemCategoryEnabled,
  onSetTamanhoFonte,
  onSetTemperaturaIa,
  onSetTemaApp,
  onSetTomConversa,
  onSetUploadArquivosAtivo,
  onSetUsoBateria,
  onSetVibracaoAtiva,
  onSetVoiceLanguage,
  onShowAlert,
}: BuildAccountDeletionActionParams) {
  function resetarPreferenciasContaPosExclusao() {
    onSetEmail("");
    onSetPerfilNome("");
    onSetPerfilExibicao("");
    onSetPerfilFotoUri("");
    onSetPerfilFotoHint("Toque para atualizar");
    onSetEmailAtualConta("");
    onResetSettingsPresentationAfterAccountDeletion();
    onSetModeloIa("equilibrado");
    onSetEstiloResposta("detalhado");
    onSetIdiomaResposta("Português");
    onSetMemoriaIa(true);
    onSetAprendizadoIa(false);
    onSetTomConversa("técnico");
    onSetTemperaturaIa(0.4);
    onSetTemaApp("claro");
    onSetTamanhoFonte("médio");
    onSetDensidadeInterface("confortável");
    onSetCorDestaque("laranja");
    onSetAnimacoesAtivas(true);
    onSetNotificaRespostas(true);
    onSetNotificaPush(true);
    onSetChatCategoryEnabled(true);
    onSetMesaCategoryEnabled(true);
    onSetSystemCategoryEnabled(true);
    onSetCriticalAlertsEnabled(true);
    onSetSomNotificacao("Ping");
    onSetVibracaoAtiva(true);
    onSetEmailsAtivos(false);
    onSetSalvarHistoricoConversas(true);
    onSetCompartilharMelhoriaIa(false);
    onSetBackupAutomatico(true);
    onSetSincronizacaoDispositivos(true);
    onSetNomeAutomaticoConversas(true);
    onSetFixarConversas(true);
    onSetEntradaPorVoz(false);
    onSetRespostaPorVoz(false);
    onSetVoiceLanguage("Sistema");
    onSetSpeechRate(1);
    onSetPreferredVoiceId("");
    onSetUploadArquivosAtivo(true);
    onSetEconomiaDados(false);
    onSetUsoBateria("Otimizado");
    onSetIdiomaApp("Português");
    onSetRegiaoApp("Brasil");
    onSetLaudosFixadosIds([]);
    onSetHistoricoOcultoIds([]);
    onSetDeviceBiometricsEnabled(false);
    onSetRequireAuthOnOpen(true);
    onSetHideInMultitask(true);
    onSetLockTimeout("1 minuto");
    onSetRetencaoDados("90 dias");
    onSetAutoUploadAttachments(true);
    onSetMediaCompression("equilibrada");
    onSetMostrarConteudoNotificacao(false);
    onSetOcultarConteudoBloqueado(true);
    onSetMostrarSomenteNovaMensagem(true);
    onSetMicrofonePermitido(true);
    onSetCameraPermitida(true);
    onSetArquivosPermitidos(true);
    onSetNotificacoesPermitidas(true);
    onSetBiometriaPermitida(true);
  }

  return async function executarExclusaoContaLocal() {
    onSetAppLoading(true);
    fecharConfiguracoes();
    try {
      await clearPersistedAccountData();
      await handleLogout();
      resetarPreferenciasContaPosExclusao();
      onShowAlert(
        "Conta excluída neste dispositivo",
        "Sessão encerrada e dados locais removidos. Faça login novamente apenas se a conta estiver ativa.",
      );
    } catch (error) {
      const mensagem =
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a exclusão local da conta.";
      onShowAlert("Exclusão incompleta", mensagem);
    } finally {
      onSetAppLoading(false);
    }
  };
}
