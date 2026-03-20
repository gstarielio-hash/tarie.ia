import {
  ACCENT_OPTIONS,
  AI_MODEL_OPTIONS,
  APP_LANGUAGE_OPTIONS,
  BATTERY_OPTIONS,
  CONVERSATION_TONE_OPTIONS,
  DATA_RETENTION_OPTIONS,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LOCK_TIMEOUT_OPTIONS,
  NOTIFICATION_SOUND_OPTIONS,
  PAYMENT_CARD_OPTIONS,
  PLAN_OPTIONS,
  REGION_OPTIONS,
  RESPONSE_LANGUAGE_OPTIONS,
  RESPONSE_STYLE_OPTIONS,
  THEME_OPTIONS,
  TWO_FACTOR_METHOD_OPTIONS,
} from "../InspectorMobileApp.constants";

type ApplyLocalPreferencesInput = Record<string, unknown>;
type ApplyLocalPreferencesDeps = Record<string, any>;

export function applyLocalPreferencesFromStorage(
  preferencias: ApplyLocalPreferencesInput,
  deps: ApplyLocalPreferencesDeps,
) {
  const {
    ehOpcaoValida,
    formatarStatusReautenticacao,
    normalizarEventoSeguranca,
    normalizarIntegracaoExterna,
    normalizarItemSuporte,
    normalizarProviderConectado,
    normalizarSessaoAtiva,
    reautenticacaoAindaValida,
    reconciliarIntegracoesExternas,
    setAnimacoesAtivas,
    setAprendizadoIa,
    setArquivosPermitidos,
    setBackupAutomatico,
    setBiometriaPermitida,
    setBugAttachmentDraft,
    setCameraPermitida,
    setCartaoAtual,
    setCodigosRecuperacao,
    setCompartilharMelhoriaIa,
    setCorDestaque,
    setDensidadeInterface,
    setDeviceBiometricsEnabled,
    setEconomiaDados,
    setEmailAtualConta,
    setEmailsAtivos,
    setEntradaPorVoz,
    setEstiloResposta,
    setEventosSeguranca,
    setFilaSuporteLocal,
    setFixarConversas,
    setHideInMultitask,
    setHistoricoOcultoIds,
    setIdiomaApp,
    setIdiomaResposta,
    setIntegracoesExternas,
    setLaudosFixadosIds,
    setLockTimeout,
    setMemoriaIa,
    setMicrofonePermitido,
    setModeloIa,
    setMostrarConteudoNotificacao,
    setMostrarSomenteNovaMensagem,
    setNomeAutomaticoConversas,
    setNotificaPush,
    setNotificaRespostas,
    setNotificacoesPermitidas,
    setNovaSenhaDraft,
    setOcultarConteudoBloqueado,
    setPerfilExibicao,
    setPerfilFotoHint,
    setPerfilFotoUri,
    setPerfilNome,
    setPlanoAtual,
    setProvedoresConectados,
    setReautenticacaoExpiraEm,
    setReautenticacaoStatus,
    setRecoveryCodesEnabled,
    setRegiaoApp,
    setRequireAuthOnOpen,
    setRespostaPorVoz,
    setRetencaoDados,
    setSalvaHistoricoConversas,
    setSessoesAtivas,
    setSincronizacaoDispositivos,
    setSomNotificacao,
    setStatusAtualizacaoApp,
    setTamanhoFonte,
    setTemperaturaIa,
    setTemaApp,
    setTomConversa,
    setTwoFactorEnabled,
    setTwoFactorMethod,
    setUltimaVerificacaoAtualizacao,
    setUploadArquivosAtivo,
    setUsoBateria,
    setVibracaoAtiva,
  } = deps;

  if (typeof preferencias.perfilNome === "string") {
    setPerfilNome(preferencias.perfilNome);
  }
  if (typeof preferencias.perfilExibicao === "string") {
    setPerfilExibicao(preferencias.perfilExibicao);
  }
  if (typeof preferencias.perfilFotoUri === "string") {
    setPerfilFotoUri(preferencias.perfilFotoUri);
  }
  if (typeof preferencias.perfilFotoHint === "string") {
    setPerfilFotoHint(preferencias.perfilFotoHint);
  }
  if (Array.isArray(preferencias.laudosFixadosIds)) {
    setLaudosFixadosIds(
      preferencias.laudosFixadosIds.filter(
        (item): item is number => typeof item === "number",
      ),
    );
  }
  if (Array.isArray(preferencias.historicoOcultoIds)) {
    setHistoricoOcultoIds(
      preferencias.historicoOcultoIds.filter(
        (item): item is number => typeof item === "number",
      ),
    );
  }
  if (ehOpcaoValida(preferencias.planoAtual, PLAN_OPTIONS)) {
    setPlanoAtual(preferencias.planoAtual);
  }
  if (ehOpcaoValida(preferencias.cartaoAtual, PAYMENT_CARD_OPTIONS)) {
    setCartaoAtual(preferencias.cartaoAtual);
  }
  if (ehOpcaoValida(preferencias.modeloIa, AI_MODEL_OPTIONS)) {
    setModeloIa(preferencias.modeloIa);
  }
  if (ehOpcaoValida(preferencias.estiloResposta, RESPONSE_STYLE_OPTIONS)) {
    setEstiloResposta(preferencias.estiloResposta);
  }
  if (ehOpcaoValida(preferencias.idiomaResposta, RESPONSE_LANGUAGE_OPTIONS)) {
    setIdiomaResposta(preferencias.idiomaResposta);
  }
  if (typeof preferencias.memoriaIa === "boolean") {
    setMemoriaIa(preferencias.memoriaIa);
  }
  if (typeof preferencias.aprendizadoIa === "boolean") {
    setAprendizadoIa(preferencias.aprendizadoIa);
  }
  if (ehOpcaoValida(preferencias.tomConversa, CONVERSATION_TONE_OPTIONS)) {
    setTomConversa(preferencias.tomConversa);
  }
  if (
    typeof preferencias.temperaturaIa === "number" &&
    !Number.isNaN(preferencias.temperaturaIa)
  ) {
    setTemperaturaIa(Math.max(0, Math.min(1, preferencias.temperaturaIa)));
  }
  if (ehOpcaoValida(preferencias.temaApp, THEME_OPTIONS)) {
    setTemaApp(preferencias.temaApp);
  }
  if (ehOpcaoValida(preferencias.tamanhoFonte, FONT_SIZE_OPTIONS)) {
    setTamanhoFonte(preferencias.tamanhoFonte);
  }
  if (ehOpcaoValida(preferencias.densidadeInterface, DENSITY_OPTIONS)) {
    setDensidadeInterface(preferencias.densidadeInterface);
  }
  if (ehOpcaoValida(preferencias.corDestaque, ACCENT_OPTIONS)) {
    setCorDestaque(preferencias.corDestaque);
  }
  if (typeof preferencias.animacoesAtivas === "boolean") {
    setAnimacoesAtivas(preferencias.animacoesAtivas);
  }
  if (typeof preferencias.notificaRespostas === "boolean") {
    setNotificaRespostas(preferencias.notificaRespostas);
  }
  if (typeof preferencias.notificaPush === "boolean") {
    setNotificaPush(preferencias.notificaPush);
  }
  if (ehOpcaoValida(preferencias.somNotificacao, NOTIFICATION_SOUND_OPTIONS)) {
    setSomNotificacao(preferencias.somNotificacao);
  }
  if (typeof preferencias.vibracaoAtiva === "boolean") {
    setVibracaoAtiva(preferencias.vibracaoAtiva);
  }
  if (typeof preferencias.emailsAtivos === "boolean") {
    setEmailsAtivos(preferencias.emailsAtivos);
  }
  if (typeof preferencias.salvarHistoricoConversas === "boolean") {
    setSalvaHistoricoConversas(preferencias.salvarHistoricoConversas);
  }
  if (typeof preferencias.compartilharMelhoriaIa === "boolean") {
    setCompartilharMelhoriaIa(preferencias.compartilharMelhoriaIa);
  }
  if (typeof preferencias.backupAutomatico === "boolean") {
    setBackupAutomatico(preferencias.backupAutomatico);
  }
  if (typeof preferencias.sincronizacaoDispositivos === "boolean") {
    setSincronizacaoDispositivos(preferencias.sincronizacaoDispositivos);
  }
  if (typeof preferencias.nomeAutomaticoConversas === "boolean") {
    setNomeAutomaticoConversas(preferencias.nomeAutomaticoConversas);
  }
  if (typeof preferencias.fixarConversas === "boolean") {
    setFixarConversas(preferencias.fixarConversas);
  }
  if (typeof preferencias.entradaPorVoz === "boolean") {
    setEntradaPorVoz(preferencias.entradaPorVoz);
  }
  if (typeof preferencias.respostaPorVoz === "boolean") {
    setRespostaPorVoz(preferencias.respostaPorVoz);
  }
  if (typeof preferencias.uploadArquivosAtivo === "boolean") {
    setUploadArquivosAtivo(preferencias.uploadArquivosAtivo);
  }
  if (typeof preferencias.economiaDados === "boolean") {
    setEconomiaDados(preferencias.economiaDados);
  }
  if (ehOpcaoValida(preferencias.usoBateria, BATTERY_OPTIONS)) {
    setUsoBateria(preferencias.usoBateria);
  }
  if (ehOpcaoValida(preferencias.idiomaApp, APP_LANGUAGE_OPTIONS)) {
    setIdiomaApp(preferencias.idiomaApp);
  }
  if (ehOpcaoValida(preferencias.regiaoApp, REGION_OPTIONS)) {
    setRegiaoApp(preferencias.regiaoApp);
  }
  if (Array.isArray(preferencias.provedoresConectados)) {
    const provedores = preferencias.provedoresConectados
      .map((item) => normalizarProviderConectado(item))
      .filter(Boolean);
    if (provedores.length) {
      setProvedoresConectados(provedores);
    }
  }
  if (Array.isArray(preferencias.integracoesExternas)) {
    const integracoes = preferencias.integracoesExternas
      .map((item) => normalizarIntegracaoExterna(item))
      .filter(Boolean);
    setIntegracoesExternas(reconciliarIntegracoesExternas(integracoes));
  }
  if (Array.isArray(preferencias.sessoesAtivas)) {
    const sessoes = preferencias.sessoesAtivas
      .map((item) => normalizarSessaoAtiva(item))
      .filter(Boolean);
    if (sessoes.length) {
      setSessoesAtivas(sessoes);
    }
  }
  if (typeof preferencias.twoFactorEnabled === "boolean") {
    setTwoFactorEnabled(preferencias.twoFactorEnabled);
  }
  if (ehOpcaoValida(preferencias.twoFactorMethod, TWO_FACTOR_METHOD_OPTIONS)) {
    setTwoFactorMethod(preferencias.twoFactorMethod);
  }
  if (typeof preferencias.recoveryCodesEnabled === "boolean") {
    setRecoveryCodesEnabled(preferencias.recoveryCodesEnabled);
  }
  if (typeof preferencias.deviceBiometricsEnabled === "boolean") {
    setDeviceBiometricsEnabled(preferencias.deviceBiometricsEnabled);
  }
  if (typeof preferencias.requireAuthOnOpen === "boolean") {
    setRequireAuthOnOpen(preferencias.requireAuthOnOpen);
  }
  if (typeof preferencias.hideInMultitask === "boolean") {
    setHideInMultitask(preferencias.hideInMultitask);
  }
  if (ehOpcaoValida(preferencias.lockTimeout, LOCK_TIMEOUT_OPTIONS)) {
    setLockTimeout(preferencias.lockTimeout);
  }
  if (ehOpcaoValida(preferencias.retencaoDados, DATA_RETENTION_OPTIONS)) {
    setRetencaoDados(preferencias.retencaoDados);
  }
  if (Array.isArray(preferencias.codigosRecuperacao)) {
    setCodigosRecuperacao(
      preferencias.codigosRecuperacao.filter(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim()),
      ),
    );
  }
  if (typeof preferencias.reautenticacaoExpiraEm === "string") {
    if (reautenticacaoAindaValida(preferencias.reautenticacaoExpiraEm)) {
      setReautenticacaoExpiraEm(preferencias.reautenticacaoExpiraEm);
      setReautenticacaoStatus(
        formatarStatusReautenticacao(preferencias.reautenticacaoExpiraEm),
      );
    } else {
      setReautenticacaoExpiraEm("");
      setReautenticacaoStatus("Não confirmada");
    }
  }
  if (typeof preferencias.reautenticacaoStatus === "string") {
    if (
      !reautenticacaoAindaValida(
        typeof preferencias.reautenticacaoExpiraEm === "string"
          ? preferencias.reautenticacaoExpiraEm
          : "",
      )
    ) {
      setReautenticacaoStatus(preferencias.reautenticacaoStatus);
    }
  }
  if (Array.isArray(preferencias.eventosSeguranca)) {
    const eventos = preferencias.eventosSeguranca
      .map((item) => normalizarEventoSeguranca(item))
      .filter(Boolean);
    if (eventos.length) {
      setEventosSeguranca(eventos);
    }
  }
  if (typeof preferencias.mostrarConteudoNotificacao === "boolean") {
    setMostrarConteudoNotificacao(preferencias.mostrarConteudoNotificacao);
  }
  if (typeof preferencias.ocultarConteudoBloqueado === "boolean") {
    setOcultarConteudoBloqueado(preferencias.ocultarConteudoBloqueado);
  }
  if (typeof preferencias.mostrarSomenteNovaMensagem === "boolean") {
    setMostrarSomenteNovaMensagem(preferencias.mostrarSomenteNovaMensagem);
  }
  if (typeof preferencias.microfonePermitido === "boolean") {
    setMicrofonePermitido(preferencias.microfonePermitido);
  }
  if (typeof preferencias.cameraPermitida === "boolean") {
    setCameraPermitida(preferencias.cameraPermitida);
  }
  if (typeof preferencias.arquivosPermitidos === "boolean") {
    setArquivosPermitidos(preferencias.arquivosPermitidos);
  }
  if (typeof preferencias.notificacoesPermitidas === "boolean") {
    setNotificacoesPermitidas(preferencias.notificacoesPermitidas);
  }
  if (typeof preferencias.biometriaPermitida === "boolean") {
    setBiometriaPermitida(preferencias.biometriaPermitida);
  }
  if (Array.isArray(preferencias.filaSuporteLocal)) {
    setFilaSuporteLocal(
      preferencias.filaSuporteLocal
        .map((item) => normalizarItemSuporte(item))
        .filter(Boolean),
    );
  }
  if (typeof preferencias.ultimaVerificacaoAtualizacao === "string") {
    setUltimaVerificacaoAtualizacao(preferencias.ultimaVerificacaoAtualizacao);
  }
  if (typeof preferencias.statusAtualizacaoApp === "string") {
    setStatusAtualizacaoApp(preferencias.statusAtualizacaoApp);
  }
  if (typeof preferencias.emailAtualConta === "string") {
    setEmailAtualConta(preferencias.emailAtualConta);
  }
  if (typeof preferencias.novaSenhaDraft === "string") {
    setNovaSenhaDraft(preferencias.novaSenhaDraft);
  }
  if ("bugAttachmentDraft" in preferencias) {
    setBugAttachmentDraft(preferencias.bugAttachmentDraft ?? null);
  }
}
