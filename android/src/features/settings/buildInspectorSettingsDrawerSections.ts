type InspectorSettingsSectionInput = Record<string, any>;

export function buildInspectorAccountSectionContentProps(
  input: InspectorSettingsSectionInput,
) {
  return (
    input.accountSectionContentProps || {
      contaEmailLabel: input.contaEmailLabel,
      contaTelefoneLabel: input.contaTelefoneLabel,
      onEditarPerfil: input.handleEditarPerfil,
      onAlterarEmail: input.handleAlterarEmail,
      onAlterarSenha: input.handleAlterarSenha,
      onSolicitarLogout: input.handleSolicitarLogout,
      onUploadFotoPerfil: input.handleUploadFotoPerfil,
      perfilExibicaoLabel: input.perfilExibicaoLabel,
      perfilFotoHint: input.perfilFotoHint,
      perfilFotoUri: input.perfilFotoUri,
      perfilNomeCompleto: input.perfilNomeCompleto,
      provedorPrimario: input.provedorPrimario,
      resumoConta: input.resumoContaAcesso,
      workspaceAtual: input.workspaceResumoConfiguracao,
    }
  );
}

export function buildInspectorAdvancedResourcesSectionProps(
  input: InspectorSettingsSectionInput,
) {
  return (
    input.advancedResourcesSectionProps || {
      speechEnabled: input.speechEnabled,
      entradaPorVoz: input.entradaPorVoz,
      microfonePermitido: input.microfonePermitido,
      onAbrirAjudaDitado: input.handleAbrirAjudaDitado,
      onAbrirAjustesDoSistema: () =>
        input.handleAbrirAjustesDoSistema(
          "recursos de voz, acessibilidade e permissões de áudio",
        ),
      onCyclePreferredVoice: input.onCyclePreferredVoice,
      onSetSpeechRate: input.setSpeechRate,
      onSetVoiceLanguage: input.setVoiceLanguage,
      onToggleSpeechEnabled: input.handleToggleSpeechEnabled,
      onToggleEntradaPorVoz: input.handleToggleEntradaPorVoz,
      onToggleRespostaPorVoz: input.handleToggleRespostaPorVoz,
      preferredVoiceLabel: input.preferredVoiceLabel,
      respostaPorVoz: input.respostaPorVoz,
      speechRate: input.speechRate,
      sttSupported: input.sttSupported,
      ttsSupported: input.ttsSupported,
      voiceLanguage: input.voiceLanguage,
    }
  );
}

export function buildInspectorExperienceSectionProps(
  input: InspectorSettingsSectionInput,
) {
  return {
    experienceAiSectionProps: {
      aprendizadoIa: input.aprendizadoIa,
      estiloResposta: input.estiloResposta,
      idiomaResposta: input.idiomaResposta,
      memoriaIa: input.memoriaIa,
      modeloIa: input.modeloIa,
      onAbrirMenuModeloIa: input.handleAbrirModeloIa,
      onSetAprendizadoIa: input.setAprendizadoIa,
      onSetEstiloResposta: input.setEstiloResposta,
      onSetIdiomaResposta: input.setIdiomaResposta,
      onSetMemoriaIa: input.setMemoriaIa,
      onSetTemperaturaIa: input.setTemperaturaIa,
      onSetTomConversa: input.setTomConversa,
      temperaturaIa: input.temperaturaIa,
      tomConversa: input.tomConversa,
    },
    experienceAppearanceSectionProps: {
      animacoesAtivas: input.animacoesAtivas,
      corDestaque: input.corDestaque,
      densidadeInterface: input.densidadeInterface,
      onSetAnimacoesAtivas: input.setAnimacoesAtivas,
      onSetCorDestaque: input.setCorDestaque,
      onSetDensidadeInterface: input.setDensidadeInterface,
      onSetTamanhoFonte: input.setTamanhoFonte,
      onSetTemaApp: input.setTemaApp,
      tamanhoFonte: input.tamanhoFonte,
      temaApp: input.temaApp,
    },
    experienceNotificationsSectionProps:
      input.experienceNotificationsSectionProps || {
        chatCategoryEnabled: input.chatCategoryEnabled,
        criticalAlertsEnabled: input.criticalAlertsEnabled,
        emailsAtivos: input.emailsAtivos,
        mesaCategoryEnabled: input.mesaCategoryEnabled,
        notificaPush: input.notificaPush,
        notificaRespostas: input.notificaRespostas,
        notificacoesPermitidas: input.notificacoesPermitidas,
        onAbrirPermissaoNotificacoes: input.onAbrirPermissaoNotificacoes,
        onSetChatCategoryEnabled: input.setChatCategoryEnabled,
        onSetCriticalAlertsEnabled: input.setCriticalAlertsEnabled,
        onSetEmailsAtivos: input.setEmailsAtivos,
        onSetMesaCategoryEnabled: input.setMesaCategoryEnabled,
        onSetNotificaRespostas: input.setNotificaRespostas,
        onSetSomNotificacao: input.setSomNotificacao,
        onSetSystemCategoryEnabled: input.setSystemCategoryEnabled,
        onToggleNotificaPush: input.handleToggleNotificaPush,
        onToggleVibracao: input.handleToggleVibracao,
        somNotificacao: input.somNotificacao,
        systemCategoryEnabled: input.systemCategoryEnabled,
        vibracaoAtiva: input.vibracaoAtiva,
      },
  };
}

export function buildInspectorOverviewSectionProps(
  input: InspectorSettingsSectionInput,
) {
  return {
    overviewContentProps: {
      contaEmailLabel: input.contaEmailLabel,
      contaTelefoneLabel: input.contaTelefoneLabel,
      corDestaqueResumoConfiguracao: input.corDestaqueResumoConfiguracao,
      iniciaisPerfilConfiguracao: input.iniciaisPerfilConfiguracao,
      nomeUsuarioExibicao: input.nomeUsuarioExibicao,
      onAbrirPaginaConfiguracoes: input.handleAbrirPaginaConfiguracoes,
      onFecharConfiguracoes: input.fecharConfiguracoes,
      onLogout: input.handleSolicitarLogout,
      onReportarProblema: input.handleReportarProblema,
      onUploadFotoPerfil: input.handleUploadFotoPerfil,
      perfilFotoUri: input.perfilFotoUri,
      planoResumoConfiguracao: input.planoResumoConfiguracao,
      settingsPrintDarkMode: input.settingsPrintDarkMode,
      temaResumoConfiguracao: input.temaResumoConfiguracao,
      workspaceResumoConfiguracao: input.workspaceResumoConfiguracao,
    },
    priorityActionsContentProps: {
      onRevisarPermissoesCriticas: input.handleRevisarPermissoesCriticas,
      onVerificarAtualizacoes: input.handleVerificarAtualizacoes,
      permissoesNegadasTotal: input.permissoesNegadasTotal,
      temPrioridadesConfiguracao: input.temPrioridadesConfiguracao,
      ultimaVerificacaoAtualizacaoLabel:
        input.ultimaVerificacaoAtualizacaoLabel,
    },
    sectionMenuContentProps: {
      onAbrirSecaoConfiguracoes: input.handleAbrirSecaoConfiguracoes,
    },
  };
}

export function buildInspectorSecuritySectionProps(
  input: InspectorSettingsSectionInput,
) {
  return {
    securityActivitySectionProps: {
      eventosSegurancaFiltrados: input.eventosSegurancaFiltrados,
      filtroEventosSeguranca: input.filtroEventosSeguranca,
      onReportarAtividadeSuspeita: input.handleReportarAtividadeSuspeita,
      onSetFiltroEventosSeguranca: input.setFiltroEventosSeguranca,
    },
    securityConnectedAccountsSectionProps: {
      onToggleProviderConnection: input.handleToggleProviderConnection,
      provedoresConectados: input.provedoresConectados,
      provedoresConectadosTotal: input.provedoresConectadosTotal,
      provedorPrimario: input.provedorPrimario,
      resumoAlertaMetodosConta: input.resumoAlertaMetodosConta,
      ultimoEventoProvedor: input.ultimoEventoProvedor,
    },
    securityDataConversationsSectionProps: {
      analyticsOptIn: input.analyticsOptIn,
      backupAutomatico: input.backupAutomatico,
      compartilharMelhoriaIa: input.compartilharMelhoriaIa,
      conversasOcultasTotal: input.conversasOcultasTotal,
      conversasVisiveisTotal: input.conversasVisiveisTotal,
      crashReportsOptIn: input.crashReportsOptIn,
      fixarConversas: input.fixarConversas,
      autoUploadAttachments: input.autoUploadAttachments,
      cacheStatusLabel: input.resumoCache,
      nomeAutomaticoConversas: input.nomeAutomaticoConversas,
      limpandoCache: input.limpandoCache,
      mediaCompression: input.mediaCompression,
      onApagarHistoricoConfiguracoes: input.handleApagarHistoricoConfiguracoes,
      onExportarDados: input.handleExportarDados,
      onGerenciarConversasIndividuais:
        input.handleGerenciarConversasIndividuais,
      onLimparCache: input.handleLimparCache,
      onSetAnalyticsOptIn: input.setAnalyticsOptIn,
      onSetCrashReportsOptIn: input.setCrashReportsOptIn,
      onSetMediaCompression: input.setMediaCompression,
      onLimparTodasConversasConfig: input.handleLimparTodasConversasConfig,
      onSetCompartilharMelhoriaIa: input.setCompartilharMelhoriaIa,
      onSetFixarConversas: input.setFixarConversas,
      onSetNomeAutomaticoConversas: input.setNomeAutomaticoConversas,
      onSetRetencaoDados: input.setRetencaoDados,
      onSetSalvarHistoricoConversas: input.setSalvarHistoricoConversas,
      onSetWifiOnlySync: input.setWifiOnlySync,
      onToggleAutoUploadAttachments: input.setAutoUploadAttachments,
      onToggleBackupAutomatico: input.handleToggleBackupAutomatico,
      onToggleSincronizacaoDispositivos:
        input.handleToggleSincronizacaoDispositivos,
      retencaoDados: input.retencaoDados,
      resumoDadosConversas: input.resumoDadosConversas,
      salvarHistoricoConversas: input.salvarHistoricoConversas,
      sincronizacaoDispositivos: input.sincronizacaoDispositivos,
      wifiOnlySync: input.wifiOnlySync,
    },
    securityDeleteAccountSectionProps: {
      onExcluirConta: input.handleExcluirConta,
      onExportarAntesDeExcluirConta: input.handleExportarAntesDeExcluirConta,
      onReautenticacaoSensivel: input.handleReautenticacaoSensivel,
      reautenticacaoStatus: input.reautenticacaoStatus,
      resumoExcluirConta: input.resumoExcluirConta,
    },
    securityDeviceProtectionSectionProps: {
      biometricsSupported: false,
      deviceBiometricsEnabled: input.deviceBiometricsEnabled,
      hideInMultitask: input.hideInMultitask,
      lockTimeout: input.lockTimeout,
      onSetHideInMultitask: input.setHideInMultitask,
      onSetLockTimeout: input.setLockTimeout,
      onSetRequireAuthOnOpen: input.setRequireAuthOnOpen,
      onToggleBiometriaNoDispositivo: input.handleToggleBiometriaNoDispositivo,
      requireAuthOnOpen: input.requireAuthOnOpen,
    },
    securityFileUploadSectionProps: {
      onDetalhesSegurancaArquivos: input.handleDetalhesSegurancaArquivos,
    },
    securityIdentityVerificationSectionProps: {
      onReautenticacaoSensivel: input.handleReautenticacaoSensivel,
      reautenticacaoStatus: input.reautenticacaoStatus,
    },
    securityNotificationPrivacySectionProps: {
      mostrarConteudoNotificacao: input.mostrarConteudoNotificacao,
      mostrarSomenteNovaMensagem: input.mostrarSomenteNovaMensagem,
      ocultarConteudoBloqueado: input.ocultarConteudoBloqueado,
      onToggleMostrarConteudoNotificacao:
        input.handleToggleMostrarConteudoNotificacao,
      onToggleMostrarSomenteNovaMensagem:
        input.handleToggleMostrarSomenteNovaMensagem,
      onToggleOcultarConteudoBloqueado:
        input.handleToggleOcultarConteudoBloqueado,
      previewPrivacidadeNotificacao: input.previewPrivacidadeNotificacao,
      resumoPrivacidadeNotificacoes: input.resumoPrivacidadeNotificacoes,
    },
    securityPermissionsSectionProps: {
      arquivosPermitidos: input.arquivosPermitidos,
      biometriaPermitida: input.biometriaPermitida,
      cameraPermitida: input.cameraPermitida,
      microfonePermitido: input.microfonePermitido,
      notificacoesPermitidas: input.notificacoesPermitidas,
      onAbrirAjustesDoSistema: input.handleAbrirAjustesDoSistema,
      onGerenciarPermissao: input.handleGerenciarPermissao,
      onRevisarPermissoesCriticas: input.handleRevisarPermissoesCriticas,
      permissoesNegadasTotal: input.permissoesNegadasTotal,
      resumoPermissoes: input.resumoPermissoes,
      resumoPermissoesCriticas: input.resumoPermissoesCriticas,
      showBiometricsPermission: false,
    },
    securitySessionsSectionProps: {
      onEncerrarOutrasSessoes: input.handleEncerrarOutrasSessoes,
      onEncerrarSessao: input.handleEncerrarSessao,
      onEncerrarSessaoAtual: input.handleEncerrarSessaoAtual,
      onEncerrarSessoesSuspeitas: input.handleEncerrarSessoesSuspeitas,
      onFecharConfiguracoes: input.fecharConfiguracoes,
      onLogout: input.handleLogout,
      onRevisarSessao: input.handleRevisarSessao,
      outrasSessoesAtivas: input.outrasSessoesAtivas,
      resumoBlindagemSessoes: input.resumoBlindagemSessoes,
      resumoSessaoAtual: input.resumoSessaoAtual,
      sessoesAtivas: input.sessoesAtivas,
      sessoesSuspeitasTotal: input.sessoesSuspeitasTotal,
      ultimoEventoSessao: input.ultimoEventoSessao,
    },
    securityTwoFactorSectionProps: {
      codigo2FA: input.codigo2FA,
      codigosRecuperacao: input.codigosRecuperacao,
      onCompartilharCodigosRecuperacao:
        input.handleCompartilharCodigosRecuperacao,
      onConfirmarCodigo2FA: input.handleConfirmarCodigo2FA,
      onGerarCodigosRecuperacao: input.handleGerarCodigosRecuperacao,
      onMudarMetodo2FA: input.handleMudarMetodo2FA,
      onSetCodigo2FA: input.setCodigo2FA,
      onSetRecoveryCodesEnabled: input.setRecoveryCodesEnabled,
      onToggle2FA: input.handleToggle2FA,
      reautenticacaoStatus: input.reautenticacaoStatus,
      recoveryCodesEnabled: input.recoveryCodesEnabled,
      resumo2FAFootnote: input.resumo2FAFootnote,
      resumo2FAStatus: input.resumo2FAStatus,
      resumoCodigosRecuperacao: input.resumoCodigosRecuperacao,
      twoFactorEnabled: input.twoFactorEnabled,
      twoFactorMethod: input.twoFactorMethod,
    },
  };
}

export function buildInspectorSupportAndSystemSectionProps(
  input: InspectorSettingsSectionInput,
) {
  return {
    supportSectionProps: {
      onCanalSuporte:
        input.supportChannelLabel === "Canal indisponível"
          ? undefined
          : input.handleAbrirCanalSuporte,
      onCentralAjuda: input.handleCentralAjuda,
      onEnviarFeedback: input.handleEnviarFeedback,
      onExportarDiagnosticoApp: input.handleExportarDiagnosticoApp,
      onLicencas: input.handleLicencas,
      onLimparFilaSuporteLocal: input.handleLimparFilaSuporteLocal,
      onPoliticaPrivacidade: input.handlePoliticaPrivacidade,
      onReportarProblema: input.handleReportarProblema,
      onSobreApp: input.handleAbrirSobreApp,
      onTermosUso: input.handleTermosUso,
      resumoFilaSuporteLocal: input.resumoFilaSuporteLocal,
      resumoSuporteApp: input.resumoSuporteApp,
      supportChannelLabel: input.supportChannelLabel,
      ticketsBugTotal: input.ticketsBugTotal,
      ticketsFeedbackTotal: input.ticketsFeedbackTotal,
      ultimoTicketSuporte: input.ultimoTicketSuporteResumo,
    },
    systemSectionProps: {
      appBuildChannel: input.appBuildChannel,
      appVersionLabel: input.appVersionLabel,
      economiaDados: input.economiaDados,
      idiomaApp: input.idiomaApp,
      onAbrirCentralAtividade: input.handleAbrirCentralAtividade,
      onFecharConfiguracoes: input.fecharConfiguracoes,
      onLimparCache: input.handleLimparCache,
      onPermissoes: input.handlePermissoes,
      onRefreshData: input.handleRefresh,
      onSetEconomiaDados: input.setEconomiaDados,
      onSetIdiomaApp: input.setIdiomaApp,
      onSetRegiaoApp: input.setRegiaoApp,
      onSetUsoBateria: input.setUsoBateria,
      onVerificarAtualizacoes: input.handleVerificarAtualizacoes,
      regiaoApp: input.regiaoApp,
      resumoCache: input.resumoCache,
      resumoCentralAtividade: input.resumoCentralAtividade,
      resumoFilaOffline: input.resumoFilaOffline,
      resumoPermissoes: input.resumoPermissoes,
      sincronizandoDados: input.sincronizandoDados,
      ultimaVerificacaoAtualizacaoLabel:
        input.ultimaVerificacaoAtualizacaoLabel,
      usoBateria: input.usoBateria,
      verificandoAtualizacoes: input.verificandoAtualizacoes,
    },
  };
}
