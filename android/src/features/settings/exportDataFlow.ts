interface ExportIntegrationItem {
  id: string;
  label: string;
  connected: boolean;
  lastSyncAt: string;
}

interface ExportLaudoItem {
  id: number;
  titulo: string;
  status_card_label: string;
  data_iso: string;
}

interface ExportNotificationItem {
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
}

interface RunExportDataFlowParams {
  formato: "JSON" | "PDF" | "TXT";
  reautenticacaoExpiraEm: string;
  reautenticacaoAindaValida: (value: string) => boolean;
  abrirFluxoReautenticacao: (motivo: string, onSuccess?: () => void) => void;
  registrarEventoSegurancaLocal: (payload: {
    title: string;
    meta: string;
    status: string;
    type: "data" | "login" | "provider" | "session" | "2fa";
    critical?: boolean;
  }) => void;
  abrirSheetConfiguracao: (payload: any) => void;
  perfilNome: string;
  perfilExibicao: string;
  emailAtualConta: string;
  email: string;
  planoAtual: string;
  modeloIa: string;
  estiloResposta: string;
  idiomaResposta: string;
  temaApp: string;
  tamanhoFonte: string;
  densidadeInterface: string;
  corDestaque: string;
  memoriaIa: boolean;
  aprendizadoIa: boolean;
  economiaDados: boolean;
  usoBateria: string;
  notificaPush: boolean;
  notificaRespostas: boolean;
  emailsAtivos: boolean;
  vibracaoAtiva: boolean;
  mostrarConteudoNotificacao: boolean;
  mostrarSomenteNovaMensagem: boolean;
  salvarHistoricoConversas: boolean;
  compartilharMelhoriaIa: boolean;
  retencaoDados: string;
  ocultarConteudoBloqueado: boolean;
  integracoesExternas: ExportIntegrationItem[];
  laudosDisponiveis: ExportLaudoItem[];
  notificacoes: ExportNotificationItem[];
  eventosSeguranca: unknown[];
  serializarPayloadExportacao: (payload: unknown) => string;
  compartilharTextoExportado: (params: {
    extension: "json" | "txt";
    content: string;
    prefixo: string;
  }) => Promise<boolean>;
}

export async function runExportDataFlow({
  formato,
  reautenticacaoExpiraEm,
  reautenticacaoAindaValida,
  abrirFluxoReautenticacao,
  registrarEventoSegurancaLocal,
  abrirSheetConfiguracao,
  perfilNome,
  perfilExibicao,
  emailAtualConta,
  email,
  planoAtual,
  modeloIa,
  estiloResposta,
  idiomaResposta,
  temaApp,
  tamanhoFonte,
  densidadeInterface,
  corDestaque,
  memoriaIa,
  aprendizadoIa,
  economiaDados,
  usoBateria,
  notificaPush,
  notificaRespostas,
  emailsAtivos,
  vibracaoAtiva,
  mostrarConteudoNotificacao,
  mostrarSomenteNovaMensagem,
  salvarHistoricoConversas,
  compartilharMelhoriaIa,
  retencaoDados,
  ocultarConteudoBloqueado,
  integracoesExternas,
  laudosDisponiveis,
  notificacoes,
  eventosSeguranca,
  serializarPayloadExportacao,
  compartilharTextoExportado,
}: RunExportDataFlowParams) {
  if (!reautenticacaoAindaValida(reautenticacaoExpiraEm)) {
    abrirFluxoReautenticacao(`Confirme sua identidade para exportar os dados do inspetor em ${formato}.`, () => {
      void runExportDataFlow({
        formato,
        reautenticacaoExpiraEm,
        reautenticacaoAindaValida,
        abrirFluxoReautenticacao,
        registrarEventoSegurancaLocal,
        abrirSheetConfiguracao,
        perfilNome,
        perfilExibicao,
        emailAtualConta,
        email,
        planoAtual,
        modeloIa,
        estiloResposta,
        idiomaResposta,
        temaApp,
        tamanhoFonte,
        densidadeInterface,
        corDestaque,
        memoriaIa,
        aprendizadoIa,
        economiaDados,
        usoBateria,
        notificaPush,
        notificaRespostas,
        emailsAtivos,
        vibracaoAtiva,
        mostrarConteudoNotificacao,
        mostrarSomenteNovaMensagem,
        salvarHistoricoConversas,
        compartilharMelhoriaIa,
        retencaoDados,
        ocultarConteudoBloqueado,
        integracoesExternas,
        laudosDisponiveis,
        notificacoes,
        eventosSeguranca,
        serializarPayloadExportacao,
        compartilharTextoExportado,
      });
    });
    return;
  }

  registrarEventoSegurancaLocal({
    title: "Exportação de dados solicitada",
    meta: `Formato ${formato} com verificação adicional pendente`,
    status: "Agora",
    type: "data",
    critical: true,
  });

  if (formato === "PDF") {
    abrirSheetConfiguracao({
      kind: "privacy",
      title: `Exportar em ${formato}`,
      subtitle: `Revise o conteúdo desta exportação em ${formato} antes de gerar o arquivo final para compartilhar.`,
    });
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    account: {
      nome: perfilNome || perfilExibicao || "Inspetor Tariel",
      exibicao: perfilExibicao || perfilNome || "Inspetor",
      email: emailAtualConta || email || "",
      plano: planoAtual,
    },
    settings: {
      modeloIa,
      estiloResposta,
      idiomaResposta,
      temaApp,
      tamanhoFonte,
      densidadeInterface,
      corDestaque,
      memoriaIa,
      aprendizadoIa,
      economiaDados,
      usoBateria,
      notificacoes: {
        push: notificaPush,
        respostas: notificaRespostas,
        email: emailsAtivos,
        vibracao: vibracaoAtiva,
        preview: mostrarConteudoNotificacao,
        somenteNovaMensagem: mostrarSomenteNovaMensagem,
      },
      privacidade: {
        salvarHistoricoConversas,
        compartilharMelhoriaIa,
        retencaoDados,
        ocultarConteudoBloqueado,
      },
      integracoes: integracoesExternas.map((item) => ({
        id: item.id,
        label: item.label,
        connected: item.connected,
        lastSyncAt: item.lastSyncAt,
      })),
    },
    laudos: laudosDisponiveis.map((item) => ({
      id: item.id,
      titulo: item.titulo,
      status: item.status_card_label,
      atualizadoEm: item.data_iso,
    })),
    notifications: notificacoes.map((item) => ({
      title: item.title,
      body: item.body,
      createdAt: item.createdAt,
      unread: item.unread,
    })),
    securityEvents: eventosSeguranca,
  };

  const conteudo =
    formato === "JSON"
      ? serializarPayloadExportacao(payload)
      : [
          "Tariel Inspetor - Exportação de dados",
          `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
          "",
          `Conta: ${payload.account.nome}`,
          `Email: ${payload.account.email}`,
          `Plano: ${payload.account.plano}`,
          "",
          `Laudos sincronizados: ${payload.laudos.length}`,
          `Notificações locais: ${payload.notifications.length}`,
          `Eventos de segurança: ${payload.securityEvents.length}`,
          "",
          "Preferências principais:",
          `- Modelo IA: ${payload.settings.modeloIa}`,
          `- Estilo: ${payload.settings.estiloResposta}`,
          `- Tema: ${payload.settings.temaApp}`,
          `- Cor de destaque: ${payload.settings.corDestaque}`,
          `- Histórico salvo: ${payload.settings.privacidade.salvarHistoricoConversas ? "sim" : "não"}`,
          `- Integrações conectadas: ${payload.settings.integracoes.filter((item) => item.connected).length}/${payload.settings.integracoes.length}`,
        ].join("\n");

  const exportado = await compartilharTextoExportado({
    extension: formato === "JSON" ? "json" : "txt",
    content: conteudo,
    prefixo: `tariel-inspetor-${formato.toLowerCase()}`,
  });

  if (exportado) {
    registrarEventoSegurancaLocal({
      title: "Dados exportados",
      meta: `Arquivo ${formato} gerado localmente`,
      status: "Agora",
      type: "data",
    });
    return;
  }

  abrirSheetConfiguracao({
    kind: "privacy",
    title: `Exportar em ${formato}`,
    subtitle: `O histórico já está organizado para exportação em ${formato} assim que esse formato estiver habilitado para a sua conta.`,
  });
}
