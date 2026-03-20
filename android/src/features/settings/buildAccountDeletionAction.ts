import { clearPersistedAccountData } from "../session/sessionStorage";

type Setter = (...args: any[]) => void;

interface BuildAccountDeletionActionParams {
  fecharConfiguracoes: () => void;
  handleLogout: () => Promise<void> | void;
  onResetSettingsPresentationAfterAccountDeletion: () => void;
  onSetAppLoading: Setter;
  onSetAprendizadoIa: Setter;
  onSetAnimacoesAtivas: Setter;
  onSetArquivosPermitidos: Setter;
  onSetAutoUploadAttachments: Setter;
  onSetBackupAutomatico: Setter;
  onSetBiometriaPermitida: Setter;
  onSetCameraPermitida: Setter;
  onSetChatCategoryEnabled: Setter;
  onSetCompartilharMelhoriaIa: Setter;
  onSetCorDestaque: Setter;
  onSetCriticalAlertsEnabled: Setter;
  onSetDensidadeInterface: Setter;
  onSetDeviceBiometricsEnabled: Setter;
  onSetEconomiaDados: Setter;
  onSetEmail: Setter;
  onSetEmailAtualConta: Setter;
  onSetEmailsAtivos: Setter;
  onSetEntradaPorVoz: Setter;
  onSetEstiloResposta: Setter;
  onSetFixarConversas: Setter;
  onSetHideInMultitask: Setter;
  onSetHistoricoOcultoIds: Setter;
  onSetIdiomaApp: Setter;
  onSetIdiomaResposta: Setter;
  onSetLaudosFixadosIds: Setter;
  onSetLockTimeout: Setter;
  onSetMediaCompression: Setter;
  onSetMemoriaIa: Setter;
  onSetMesaCategoryEnabled: Setter;
  onSetMicrofonePermitido: Setter;
  onSetModeloIa: Setter;
  onSetMostrarConteudoNotificacao: Setter;
  onSetMostrarSomenteNovaMensagem: Setter;
  onSetNomeAutomaticoConversas: Setter;
  onSetNotificaPush: Setter;
  onSetNotificaRespostas: Setter;
  onSetNotificacoesPermitidas: Setter;
  onSetOcultarConteudoBloqueado: Setter;
  onSetPerfilExibicao: Setter;
  onSetPerfilFotoHint: Setter;
  onSetPerfilFotoUri: Setter;
  onSetPerfilNome: Setter;
  onSetPreferredVoiceId: Setter;
  onSetRegiaoApp: Setter;
  onSetRequireAuthOnOpen: Setter;
  onSetRespostaPorVoz: Setter;
  onSetRetencaoDados: Setter;
  onSetSalvarHistoricoConversas: Setter;
  onSetSincronizacaoDispositivos: Setter;
  onSetSomNotificacao: Setter;
  onSetSpeechRate: Setter;
  onSetSystemCategoryEnabled: Setter;
  onSetTamanhoFonte: Setter;
  onSetTemperaturaIa: Setter;
  onSetTemaApp: Setter;
  onSetTomConversa: Setter;
  onSetUploadArquivosAtivo: Setter;
  onSetUsoBateria: Setter;
  onSetVibracaoAtiva: Setter;
  onSetVoiceLanguage: Setter;
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
