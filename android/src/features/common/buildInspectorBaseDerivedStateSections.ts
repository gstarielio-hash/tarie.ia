import { Platform, StatusBar } from "react-native";

import {
  APP_BUILD_CHANNEL,
  APP_VERSION_LABEL,
  HELP_CENTER_ARTICLES,
  HISTORY_DRAWER_FILTERS,
} from "../InspectorMobileApp.constants";
import {
  SETTINGS_DRAWER_PAGE_META,
  SETTINGS_DRAWER_SECTION_META,
  type SettingsDrawerPage,
  type SettingsSectionKey,
} from "../settings/settingsNavigationMeta";
import { buildSettingsSectionVisibility } from "../settings/settingsSectionVisibility";
import { colors, spacing } from "../../theme/tokens";

type LooseInput = Record<string, any>;

export function buildInspectorConversationDerivedState(input: LooseInput) {
  const {
    anexoMesaRascunho,
    anexoRascunho,
    arquivosPermitidos,
    abaAtiva,
    colorScheme,
    conversa,
    corDestaque,
    densidadeInterface,
    formatarTipoTemplateLaudo,
    mensagem,
    mensagemMesa,
    mensagensMesa,
    obterEscalaDensidade,
    obterEscalaFonte,
    podeEditarConversaNoComposer,
    preparandoAnexo,
    previewChatLiberadoParaConversa,
    tamanhoFonte,
    temaApp,
    uploadArquivosAtivo,
    carregandoConversa,
    carregandoMesa,
    enviandoMensagem,
    enviandoMesa,
  } = input;

  const conversaAtiva = conversa;
  const vendoMesa = abaAtiva === "mesa";
  const mensagensVisiveis = conversaAtiva?.mensagens || [];
  const mesaDisponivel = Boolean(conversaAtiva?.laudoId);
  const mesaTemMensagens = Boolean(mensagensMesa.length);
  const previewChatLiberado = previewChatLiberadoParaConversa(conversaAtiva);
  const podeEditarConversa = podeEditarConversaNoComposer(conversaAtiva);
  const placeholderComposer =
    conversaAtiva?.permiteReabrir && !previewChatLiberado
      ? "Reabra o laudo para continuar."
      : conversaAtiva && !podeEditarConversa
        ? "Laudo em modo leitura."
        : anexoRascunho
          ? "Adicione contexto opcional para acompanhar o anexo..."
          : "Escreva sua mensagem de inspeção...";
  const placeholderMesa = !mesaTemMensagens
    ? "Aguardando retorno da mesa."
    : conversaAtiva?.permiteReabrir
      ? "Reabra o laudo para responder à mesa."
      : conversaAtiva && !conversaAtiva.permiteEdicao
        ? "Laudo em modo leitura."
        : "Escreva uma resposta objetiva para a mesa...";
  const podeAcionarComposer =
    podeEditarConversa &&
    !enviandoMensagem &&
    !carregandoConversa &&
    !preparandoAnexo;
  const podeEnviarComposer = Boolean(
    (mensagem.trim() || anexoRascunho) && podeAcionarComposer,
  );
  const podeUsarComposerMesa =
    Boolean(mesaTemMensagens && conversaAtiva?.permiteEdicao) &&
    !enviandoMesa &&
    !carregandoMesa;
  const podeEnviarMesa = Boolean(
    (mensagemMesa.trim() || anexoMesaRascunho) && podeUsarComposerMesa,
  );
  const fontScale = obterEscalaFonte(tamanhoFonte);
  const densityScale = obterEscalaDensidade(densidadeInterface);
  const accentColor =
    corDestaque === "azul"
      ? "#3366FF"
      : corDestaque === "roxo"
        ? "#7C4DFF"
        : corDestaque === "personalizado"
          ? "#008F7A"
          : colors.accent;
  const temaEfetivo =
    temaApp === "automático"
      ? colorScheme === "dark"
        ? "escuro"
        : "claro"
      : temaApp;
  const appGradientColors: readonly [string, string, ...string[]] =
    temaEfetivo === "escuro"
      ? (["#0B141E", "#121F2D"] as const)
      : ([colors.surfaceCanvas, colors.surfaceSoft, colors.surface] as const);
  const settingsPrintDarkMode = temaEfetivo === "escuro";
  const podeAbrirAnexosChat =
    podeAcionarComposer && uploadArquivosAtivo && arquivosPermitidos;
  const podeAbrirAnexosMesa =
    podeUsarComposerMesa && uploadArquivosAtivo && arquivosPermitidos;
  const dynamicComposerInputStyle = {
    fontSize: 16 * fontScale,
    lineHeight: 22 * fontScale,
    minHeight: 52 * densityScale,
    paddingVertical: Math.max(10, 12 * densityScale),
  };
  const dynamicMessageTextStyle = {
    fontSize: 15 * fontScale,
    lineHeight: 24 * fontScale,
  };
  const dynamicMessageBubbleStyle = {
    paddingHorizontal: 16 * densityScale,
    paddingVertical: 14 * densityScale,
  };
  const laudoSelecionadoId = conversaAtiva?.laudoId ?? null;
  const conversaVazia =
    !vendoMesa && !conversaAtiva?.laudoId && !conversaAtiva?.mensagens.length;
  const tipoTemplateAtivoLabel = formatarTipoTemplateLaudo(
    conversaAtiva?.laudoCard?.tipo_template,
  );

  return {
    accentColor,
    appGradientColors,
    conversaAtiva,
    conversaVazia,
    densityScale,
    dynamicComposerInputStyle,
    dynamicMessageBubbleStyle,
    dynamicMessageTextStyle,
    fontScale,
    laudoSelecionadoId,
    mesaDisponivel,
    mesaTemMensagens,
    mensagensVisiveis,
    placeholderComposer,
    placeholderMesa,
    podeAbrirAnexosChat,
    podeAbrirAnexosMesa,
    podeAcionarComposer,
    podeEditarConversa,
    podeEnviarComposer,
    podeEnviarMesa,
    podeUsarComposerMesa,
    previewChatLiberado,
    settingsPrintDarkMode,
    temaEfetivo,
    tipoTemplateAtivoLabel,
    vendoMesa,
  };
}

export function buildInspectorHistoryAndOfflineDerivedState(input: LooseInput) {
  const {
    buscaHistorico,
    buildHistorySections,
    filaOffline,
    filtroFilaOffline,
    filtroHistorico,
    fixarConversas,
    historicoOcultoIds,
    laudosDisponiveis,
    notificacoes,
    pendenciaFilaProntaParaReenvio,
    prioridadePendenciaOffline,
    statusApi,
  } = input;

  const filaOfflineOrdenada = [...filaOffline].sort((a, b) => {
    const prioridade =
      prioridadePendenciaOffline(a) - prioridadePendenciaOffline(b);
    if (prioridade !== 0) {
      return prioridade;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const totalFilaOfflineFalha = filaOfflineOrdenada.filter((item) =>
    Boolean(item.lastError),
  ).length;
  const totalFilaOfflinePronta = filaOfflineOrdenada.filter((item) =>
    pendenciaFilaProntaParaReenvio(item),
  ).length;
  const totalFilaOfflineEmEspera =
    filaOfflineOrdenada.length - totalFilaOfflinePronta - totalFilaOfflineFalha;
  const totalFilaOfflineChat = filaOfflineOrdenada.filter(
    (item) => item.channel === "chat",
  ).length;
  const totalFilaOfflineMesa = filaOfflineOrdenada.filter(
    (item) => item.channel === "mesa",
  ).length;
  const filtrosFilaOffline = [
    { key: "all", label: "Tudo", count: filaOfflineOrdenada.length },
    { key: "chat", label: "Chat", count: totalFilaOfflineChat },
    { key: "mesa", label: "Mesa", count: totalFilaOfflineMesa },
  ];
  const filaOfflineFiltrada =
    filtroFilaOffline === "all"
      ? filaOfflineOrdenada
      : filaOfflineOrdenada.filter(
          (item) => item.channel === filtroFilaOffline,
        );
  const chipsResumoFilaOffline = [
    {
      key: "falha",
      label: "Falha",
      count: totalFilaOfflineFalha,
      tone: "danger" as const,
    },
    {
      key: "pronta",
      label: "Prontas",
      count: totalFilaOfflinePronta,
      tone: "accent" as const,
    },
    {
      key: "espera",
      label: "Backoff",
      count: totalFilaOfflineEmEspera,
      tone: "muted" as const,
    },
  ].filter((item) => item.count > 0);
  const termoHistorico = buscaHistorico.trim().toLowerCase();
  const historicoFiltrado = [...laudosDisponiveis]
    .sort(
      (a, b) => new Date(b.data_iso).getTime() - new Date(a.data_iso).getTime(),
    )
    .filter((item) => {
      if (!termoHistorico) {
        return true;
      }
      const alvo =
        `${item.titulo} ${item.preview} ${item.status_card_label} ${item.id}`.toLowerCase();
      return alvo.includes(termoHistorico);
    });
  const conversasFixadasTotal = laudosDisponiveis.filter(
    (item: any) => item.pinado,
  ).length;
  const conversasVisiveisTotal = laudosDisponiveis.length;
  const conversasOcultasTotal = historicoOcultoIds.length;
  const agoraReferenciaHistorico = Date.now();
  const totalHistoricoRecentes = laudosDisponiveis.filter((item: any) => {
    const timestamp = new Date(item.data_iso).getTime();
    if (Number.isNaN(timestamp)) {
      return false;
    }
    return agoraReferenciaHistorico - timestamp <= 7 * 24 * 60 * 60 * 1000;
  }).length;
  const historicoBase = historicoFiltrado.filter((item) => {
    if (filtroHistorico === "fixadas") {
      return item.pinado;
    }
    if (filtroHistorico === "recentes") {
      const timestamp = new Date(item.data_iso).getTime();
      return (
        !Number.isNaN(timestamp) &&
        agoraReferenciaHistorico - timestamp <= 7 * 24 * 60 * 60 * 1000
      );
    }
    return true;
  });
  const historicoAgrupadoFinal = buildHistorySections(
    fixarConversas
      ? [...historicoBase].sort((a, b) => Number(b.pinado) - Number(a.pinado))
      : historicoBase,
  );
  const filtrosHistoricoComContagem = HISTORY_DRAWER_FILTERS.map((item) => ({
    ...item,
    count:
      item.key === "fixadas"
        ? conversasFixadasTotal
        : item.key === "recentes"
          ? totalHistoricoRecentes
          : conversasVisiveisTotal,
  }));
  const resumoHistoricoDrawer =
    filtroHistorico === "fixadas"
      ? `${conversasFixadasTotal} conversa${conversasFixadasTotal === 1 ? "" : "s"} fixada${conversasFixadasTotal === 1 ? "" : "s"}`
      : filtroHistorico === "recentes"
        ? `${totalHistoricoRecentes} conversa${totalHistoricoRecentes === 1 ? "" : "s"} recente${totalHistoricoRecentes === 1 ? "" : "s"}`
        : `${conversasVisiveisTotal} conversa${conversasVisiveisTotal === 1 ? "" : "s"} visíve${conversasVisiveisTotal === 1 ? "l" : "is"}`;
  const historicoVazioTitulo = buscaHistorico.trim()
    ? "Nada encontrado"
    : filtroHistorico === "fixadas"
      ? "Nenhum laudo fixado"
      : filtroHistorico === "recentes"
        ? "Nada recente"
        : "Nenhum histórico ainda";
  const historicoVazioTexto = buscaHistorico.trim()
    ? "Tente outro termo."
    : filtroHistorico === "fixadas"
      ? "Fixe os mais importantes para retomar rápido."
      : filtroHistorico === "recentes"
        ? "Novos laudos aparecem aqui automaticamente."
        : "Inicie um laudo para vê-lo aqui.";
  const resumoFilaOffline = !filaOfflineOrdenada.length
    ? ""
    : filaOfflineOrdenada.length === 1
      ? `1 envio pendente${statusApi === "offline" ? " aguardando conexão" : totalFilaOfflinePronta ? " pronto para reenviar" : " em backoff"}`
      : `${filaOfflineOrdenada.length} envios pendentes${statusApi === "offline" ? " aguardando conexão" : totalFilaOfflineFalha ? ` (${totalFilaOfflineFalha} com falha)` : totalFilaOfflineEmEspera && totalFilaOfflinePronta ? ` (${totalFilaOfflinePronta} prontos, ${totalFilaOfflineEmEspera} em backoff)` : totalFilaOfflinePronta ? " prontos para reenviar" : " em backoff"}`;
  const resumoFilaOfflineFiltrada =
    filtroFilaOffline === "all"
      ? resumoFilaOffline
      : filaOfflineFiltrada.length
        ? `${filaOfflineFiltrada.length} pendência${filaOfflineFiltrada.length > 1 ? "s" : ""} ${filaOfflineFiltrada.length > 1 ? "visíveis" : "visível"} em ${filtroFilaOffline === "chat" ? "Chat" : "Mesa"}`
        : `Nenhuma pendência em ${filtroFilaOffline === "chat" ? "Chat" : "Mesa"}`;
  const podeSincronizarFilaOffline =
    statusApi === "online" && totalFilaOfflinePronta > 0;
  const notificacoesNaoLidas = notificacoes.filter(
    (item: any) => item.unread,
  ).length;

  return {
    chipsResumoFilaOffline,
    conversasFixadasTotal,
    conversasOcultasTotal,
    conversasVisiveisTotal,
    filaOfflineFiltrada,
    filaOfflineOrdenada,
    filtrosFilaOffline,
    filtrosHistoricoComContagem,
    historicoAgrupadoFinal,
    historicoFiltrado,
    historicoVazioTexto,
    historicoVazioTitulo,
    notificacoesNaoLidas,
    podeSincronizarFilaOffline,
    resumoFilaOffline,
    resumoFilaOfflineFiltrada,
    resumoHistoricoDrawer,
    totalFilaOfflineChat,
    totalFilaOfflineEmEspera,
    totalFilaOfflineFalha,
    totalFilaOfflineMesa,
    totalFilaOfflinePronta,
  };
}

export function buildInspectorSettingsDerivedState(input: LooseInput) {
  const {
    arquivosPermitidos,
    buscaAjuda,
    buscaConfiguracoes,
    cameraPermitida,
    codigosRecuperacao,
    contaTelefone,
    corDestaque,
    densidadeInterface,
    email,
    emailAtualConta,
    estiloResposta,
    eventosSeguranca,
    filaSuporteLocal,
    filtroConfiguracoes,
    filtroEventosSeguranca,
    formatarHorarioAtividade,
    formatarTipoTemplateLaudo,
    idiomaResposta,
    integracoesExternas,
    lockTimeout,
    microfonePermitido,
    modeloIa,
    mostrarConteudoNotificacao,
    mostrarSomenteNovaMensagem,
    notificacoesPermitidas,
    ocultarConteudoBloqueado,
    perfilExibicao,
    perfilNome,
    planoAtual,
    provedoresConectados,
    reautenticacaoStatus,
    recoveryCodesEnabled,
    salvarHistoricoConversas,
    session,
    settingsDrawerPage,
    settingsDrawerSection,
    sessoesAtivas,
    somNotificacao,
    statusAtualizacaoApp,
    temaApp,
    twoFactorEnabled,
    twoFactorMethod,
    ultimaVerificacaoAtualizacao,

    conversasFixadasTotal,
    conversasVisiveisTotal,
    temaEfetivo,
  } = input;

  const nomeUsuarioExibicao =
    perfilExibicao.trim() || perfilNome.trim() || "Você";
  const perfilNomeCompleto = perfilNome.trim() || "Inspetor Tariel";
  const perfilExibicaoLabel = perfilExibicao.trim() || perfilNomeCompleto;
  const contaEmailLabel = emailAtualConta || email || "Sem email cadastrado";
  const contaTelefoneLabel =
    contaTelefone?.trim() ||
    session?.bootstrap.usuario.telefone?.trim() ||
    "Não informado";
  const iniciaisPerfilConfiguracao =
    nomeUsuarioExibicao
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte: string) => parte.charAt(0).toUpperCase())
      .join("") || "TU";
  const temaResumoConfiguracao =
    temaApp === "automático"
      ? `Sistema (${temaEfetivo === "escuro" ? "Escuro" : "Claro"})`
      : temaApp === "claro"
        ? "Claro"
        : "Escuro";
  const corDestaqueResumoConfiguracao =
    corDestaque === "laranja"
      ? "Padrão"
      : formatarTipoTemplateLaudo(corDestaque);
  const planoResumoConfiguracao = planoAtual === "Pro" ? "Plus" : planoAtual;
  const workspaceResumoConfiguracao =
    session?.bootstrap.usuario.empresa_nome?.trim() || "Pessoal";
  const resumoContaAcesso =
    [
      typeof session?.bootstrap.usuario.empresa_id === "number"
        ? `Empresa #${session.bootstrap.usuario.empresa_id}`
        : "",
      typeof session?.bootstrap.usuario.nivel_acesso === "number"
        ? `Nível ${session.bootstrap.usuario.nivel_acesso}`
        : "",
    ]
      .filter(Boolean)
      .join(" • ") || "Conta corporativa autenticada";
  const provedoresConectadosTotal = provedoresConectados.filter(
    (item: any) => item.connected,
  ).length;
  const provedoresDisponiveisTotal = provedoresConectados.filter(
    (item: any) => !item.connected,
  ).length;
  const integracoesConectadasTotal = integracoesExternas.filter(
    (item: any) => item.connected,
  ).length;
  const integracoesDisponiveisTotal = integracoesExternas.length;
  const existeProvedorDisponivel = provedoresDisponiveisTotal > 0;
  const provedorPrimario = session ? "Senha" : "Credencial principal";
  const ultimoEventoProvedor =
    eventosSeguranca.find((item: any) => item.type === "provider")?.status ||
    "Sem vínculo recente";
  const ultimoEventoSessao =
    eventosSeguranca.find(
      (item: any) => item.type === "session" || item.type === "login",
    )?.status || "Sem revisão recente";
  const sessaoAtual = sessoesAtivas.find((item: any) => item.current) || null;
  const outrasSessoesAtivas = sessoesAtivas.filter(
    (item: any) => !item.current,
  );
  const sessoesSuspeitasTotal = sessoesAtivas.filter(
    (item: any) => item.suspicious,
  ).length;
  const resumoMetodosConta =
    provedoresConectadosTotal > 0
      ? `${provedoresConectadosTotal} método${provedoresConectadosTotal > 1 ? "s" : ""} conectado${provedoresConectadosTotal > 1 ? "s" : ""}`
      : "Somente credencial principal";
  const resumoAlertaMetodosConta =
    provedoresConectadosTotal <= 1
      ? "Cadastre outro método antes de remover o acesso atual."
      : `${provedoresDisponiveisTotal} provedor(es) ainda podem ser vinculados a esta conta.`;
  const resumoSessaoAtual = sessaoAtual
    ? `${sessaoAtual.title} • ${sessaoAtual.location}`
    : "Nenhuma sessão ativa identificada";
  const resumoBlindagemSessoes = sessoesSuspeitasTotal
    ? `${sessoesSuspeitasTotal} sessão(ões) marcadas como suspeitas pedem revisão imediata.`
    : "Nenhuma sessão suspeita no momento. O acesso está consistente entre os dispositivos.";
  const resumoDadosConversas = salvarHistoricoConversas
    ? `${conversasVisiveisTotal} conversa${conversasVisiveisTotal === 1 ? "" : "s"} visíve${conversasVisiveisTotal === 1 ? "l" : "is"} • ${conversasFixadasTotal} fixada${conversasFixadasTotal === 1 ? "" : "s"}`
    : "Histórico desativado para novas conversas";
  const resumo2FAStatus = twoFactorEnabled
    ? `${twoFactorMethod} ativo`
    : "Proteção adicional desativada";
  const resumo2FAFootnote = twoFactorEnabled
    ? `A conta exige ${twoFactorMethod} para ações sensíveis e logins protegidos.`
    : "Ative o 2FA para elevar a proteção da conta e reduzir risco de acesso indevido.";
  const resumoCodigosRecuperacao = recoveryCodesEnabled
    ? codigosRecuperacao.length
      ? `${codigosRecuperacao.length} códigos gerados`
      : "Pronto para gerar códigos"
    : "Códigos desativados";
  const permissoesReais = [
    microfonePermitido,
    cameraPermitida,
    arquivosPermitidos,
    notificacoesPermitidas,
  ];
  const permissoesNegadasTotal = permissoesReais.filter((item) => !item).length;
  const permissoesAtivasTotal = permissoesReais.filter(Boolean).length;
  const resumoPermissoes = `${permissoesAtivasTotal} de ${permissoesReais.length} permissões liberadas`;
  const resumoPermissoesCriticas = permissoesNegadasTotal
    ? `${permissoesNegadasTotal} permissão(ões) ainda precisam de revisão`
    : "Todas as permissões principais já estão liberadas";
  const resumoPrivacidadeNotificacoes = mostrarSomenteNovaMensagem
    ? 'Somente "Nova mensagem" aparece nas notificações.'
    : ocultarConteudoBloqueado
      ? "Prévia bloqueada na tela bloqueada."
      : mostrarConteudoNotificacao
        ? "Prévia completa habilitada quando o sistema permitir."
        : "Notificações com prévia reduzida.";
  const previewPrivacidadeNotificacao = mostrarSomenteNovaMensagem
    ? "Tariel.ia • Nova mensagem"
    : !mostrarConteudoNotificacao || ocultarConteudoBloqueado
      ? "Tariel.ia • Mensagem protegida"
      : "Tariel.ia • Laudo 204 precisa de revisão da mesa";
  const resumoExcluirConta = `${sessoesAtivas.length} sessões serão invalidadas • ${conversasVisiveisTotal} conversas visíveis nesta conta`;
  const resumoSuporteApp = `${APP_VERSION_LABEL} • ${APP_BUILD_CHANNEL}`;
  const ultimaVerificacaoAtualizacaoLabel = ultimaVerificacaoAtualizacao
    ? formatarHorarioAtividade(ultimaVerificacaoAtualizacao)
    : "Nunca verificado";
  const resumoAtualizacaoApp = ultimaVerificacaoAtualizacao
    ? `${ultimaVerificacaoAtualizacaoLabel} • ${statusAtualizacaoApp}`
    : statusAtualizacaoApp;
  const artigosAjudaFiltrados = HELP_CENTER_ARTICLES.filter((article) => {
    const termo = buscaAjuda.trim().toLowerCase();
    if (!termo) {
      return true;
    }
    const alvo =
      `${article.title} ${article.category} ${article.summary} ${article.body}`.toLowerCase();
    return alvo.includes(termo);
  });
  const ultimoTicketSuporte = filaSuporteLocal[0] || null;
  const ultimoTicketSuporteResumo = ultimoTicketSuporte
    ? {
        kind: ultimoTicketSuporte.kind,
        createdAtLabel: formatarHorarioAtividade(ultimoTicketSuporte.createdAt),
      }
    : null;
  const ticketsBugTotal = filaSuporteLocal.filter(
    (item: any) => item.kind === "bug",
  ).length;
  const ticketsFeedbackTotal = filaSuporteLocal.filter(
    (item: any) => item.kind === "feedback",
  ).length;
  const ticketsComAnexoTotal = filaSuporteLocal.filter((item: any) =>
    Boolean(item.attachmentUri),
  ).length;
  const resumoFilaSuporteLocal = filaSuporteLocal.length
    ? `${filaSuporteLocal.length} item(ns) locais • ${ticketsBugTotal} bug(s) • ${ticketsFeedbackTotal} feedback(s) • ${ticketsComAnexoTotal} com anexo`
    : "Sem itens na fila local";
  const temPrioridadesConfiguracao = permissoesNegadasTotal > 0;
  const eventosSegurancaFiltrados = eventosSeguranca.filter((item: any) => {
    if (filtroEventosSeguranca === "todos") {
      return true;
    }
    if (filtroEventosSeguranca === "críticos") {
      return item.critical;
    }
    return item.type === "login" || item.type === "session";
  });
  const {
    buscaConfiguracoesNormalizada,
    mostrarSecaoConfiguracao,
    mostrarGrupoContaAcesso,
    mostrarGrupoExperiencia,
    mostrarGrupoSeguranca,
    mostrarGrupoSistema,
    totalSecoesConfiguracaoVisiveis,
    totalSecoesContaAcesso,
    totalSecoesExperiencia,
    totalSecoesSeguranca,
    totalSecoesSistema,
    totalPrioridadesAbertas,
    resumoBuscaConfiguracoes,
  } = buildSettingsSectionVisibility({
    buscaConfiguracoes,
    filtroConfiguracoes,
    perfilNomeCompleto,
    contaEmailLabel,
    modeloIa,
    estiloResposta,
    idiomaResposta,
    temaApp,
    tamanhoFonte: input.tamanhoFonte,
    densidadeInterface,
    corDestaque,
    somNotificacao,
    provedorPrimario,
    resumoSessaoAtual,
    resumoBlindagemSessoes,
    resumo2FAStatus,
    lockTimeout,
    reautenticacaoStatus,
    totalEventosSeguranca: eventosSeguranca.length,
    resumoDadosConversas,
    resumoPermissoes,
    resumoPrivacidadeNotificacoes,
    resumoExcluirConta,
    appVersionLabel: APP_VERSION_LABEL,
    appBuildChannel: APP_BUILD_CHANNEL,
    resumoFilaSuporteLocal,
    twoFactorEnabled,
    provedoresConectadosTotal,
    permissoesNegadasTotal,
    sessoesSuspeitasTotal,
  });
  const settingsDrawerInOverview = settingsDrawerPage === "overview";
  const settingsDrawerPageKey = settingsDrawerPage as Exclude<
    SettingsDrawerPage,
    "overview"
  >;
  const settingsDrawerSectionKey = settingsDrawerSection as
    | SettingsSectionKey
    | "all";
  const settingsDrawerShowingSearchResults =
    settingsDrawerInOverview && Boolean(buscaConfiguracoesNormalizada);
  const settingsDrawerShowingOverviewCards =
    settingsDrawerInOverview && !settingsDrawerShowingSearchResults;
  const settingsDrawerMatchesPage = (page: string) =>
    settingsDrawerPage === page || settingsDrawerShowingSearchResults;
  const settingsDrawerPageSections = settingsDrawerInOverview
    ? []
    : SETTINGS_DRAWER_PAGE_META[settingsDrawerPageKey].sections.filter(
        (item: SettingsSectionKey) => mostrarSecaoConfiguracao(item),
      );
  const settingsDrawerSectionMenuAtiva =
    !settingsDrawerInOverview &&
    settingsDrawerSectionKey === "all" &&
    settingsDrawerPageSections.length > 1;
  const settingsDrawerCurrentSectionMeta =
    !settingsDrawerInOverview && settingsDrawerSectionKey !== "all"
      ? SETTINGS_DRAWER_SECTION_META[settingsDrawerSectionKey]
      : null;
  const settingsDrawerTitle = settingsDrawerInOverview
    ? "Configurações"
    : settingsDrawerCurrentSectionMeta
      ? settingsDrawerCurrentSectionMeta.title
      : SETTINGS_DRAWER_PAGE_META[settingsDrawerPageKey].title;
  const settingsDrawerSubtitle = settingsDrawerInOverview
    ? "Ajuste o app e acesse as ações rápidas do inspetor em um só lugar."
    : settingsDrawerCurrentSectionMeta
      ? settingsDrawerCurrentSectionMeta.subtitle
      : SETTINGS_DRAWER_PAGE_META[settingsDrawerPageKey].subtitle;
  const settingsDrawerMatchesSection = (
    page: string,
    section: SettingsSectionKey,
  ) =>
    settingsDrawerMatchesPage(page) &&
    mostrarSecaoConfiguracao(section) &&
    !settingsDrawerSectionMenuAtiva &&
    (settingsDrawerSectionKey === "all" ||
      settingsDrawerSectionKey === section);

  return {
    artigosAjudaFiltrados,
    buscaConfiguracoesNormalizada,
    contaEmailLabel,
    contaTelefoneLabel,
    corDestaqueResumoConfiguracao,
    eventosSegurancaFiltrados,
    existeProvedorDisponivel,
    iniciaisPerfilConfiguracao,
    integracoesConectadasTotal,
    integracoesDisponiveisTotal,
    mostrarGrupoContaAcesso,
    mostrarGrupoExperiencia,
    mostrarGrupoSeguranca,
    mostrarGrupoSistema,
    nomeUsuarioExibicao,
    outrasSessoesAtivas,
    perfilExibicaoLabel,
    perfilNomeCompleto,
    permissoesNegadasTotal,
    planoResumoConfiguracao,
    previewPrivacidadeNotificacao,
    provedoresConectadosTotal,
    provedorPrimario,
    resumo2FAFootnote,
    resumo2FAStatus,
    resumoAlertaMetodosConta,
    resumoAtualizacaoApp,
    resumoBlindagemSessoes,
    resumoBuscaConfiguracoes,
    resumoCodigosRecuperacao,
    resumoContaAcesso,
    resumoDadosConversas,
    resumoExcluirConta,
    resumoFilaSuporteLocal,
    resumoMetodosConta,
    resumoPermissoes,
    resumoPermissoesCriticas,
    resumoPrivacidadeNotificacoes,
    resumoSessaoAtual,
    resumoSuporteApp,
    sessaoAtual,
    settingsDrawerInOverview,
    settingsDrawerMatchesPage,
    settingsDrawerMatchesSection,
    settingsDrawerPageSections,
    settingsDrawerSectionMenuAtiva,
    settingsDrawerShowingOverviewCards,
    settingsDrawerShowingSearchResults,
    settingsDrawerSubtitle,
    settingsDrawerTitle,
    sessoesSuspeitasTotal,
    temaResumoConfiguracao,
    temPrioridadesConfiguracao,
    ticketsBugTotal,
    ticketsFeedbackTotal,
    totalPrioridadesAbertas,
    totalSecoesConfiguracaoVisiveis,
    totalSecoesContaAcesso,
    totalSecoesExperiencia,
    totalSecoesSeguranca,
    totalSecoesSistema,
    ultimaVerificacaoAtualizacaoLabel,
    ultimoEventoProvedor,
    ultimoEventoSessao,
    ultimoTicketSuporte,
    ultimoTicketSuporteResumo,
    workspaceResumoConfiguracao,
  };
}

export function buildInspectorLayoutDerivedState(input: LooseInput) {
  const { keyboardHeight } = input;

  const keyboardVisible = keyboardHeight > 0;
  const keyboardAvoidingBehavior = Platform.OS === "ios" ? "padding" : "height";
  const loginKeyboardVerticalOffset = Platform.OS === "ios" ? 18 : 0;
  const chatKeyboardVerticalOffset = Platform.OS === "ios" ? 8 : 0;
  const headerSafeTopInset =
    Platform.OS === "android" ? Math.max(StatusBar.currentHeight ?? 0, 0) : 0;
  const loginKeyboardBottomPadding =
    Platform.OS === "android" && keyboardVisible
      ? Math.max(spacing.xxl, keyboardHeight + spacing.xl)
      : keyboardVisible
        ? spacing.xl
        : spacing.xxl;
  const threadKeyboardPaddingBottom = keyboardVisible ? spacing.sm : spacing.md;

  return {
    chatKeyboardVerticalOffset,
    headerSafeTopInset,
    keyboardAvoidingBehavior,
    keyboardVisible,
    loginKeyboardBottomPadding,
    loginKeyboardVerticalOffset,
    threadKeyboardPaddingBottom,
  };
}
