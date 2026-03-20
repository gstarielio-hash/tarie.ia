type BuildThreadContextStateInput = Record<string, any>;

export function buildThreadContextState(input: BuildThreadContextStateInput): Record<string, any> {
  const {
    conversaAtiva,
    filtrarThreadContextChips,
    mapearStatusLaudoVisual,
    mesaDisponivel,
    mesaTemMensagens,
    mensagensMesa,
    notificacoesMesaLaudoAtual,
    resumoFilaOffline,
    statusApi,
    tipoTemplateAtivoLabel,
    vendoMesa,
  } = input;

  const statusVisualLaudo = mapearStatusLaudoVisual(
    conversaAtiva?.laudoCard?.status_card || conversaAtiva?.statusCard || "aberto",
  );
  const laudoContextTitle = vendoMesa
    ? conversaAtiva?.laudoCard?.titulo || (conversaAtiva?.laudoId ? `Laudo #${conversaAtiva.laudoId}` : "Mesa avaliadora")
    : conversaAtiva?.laudoCard?.titulo || (conversaAtiva?.laudoId ? `Laudo #${conversaAtiva.laudoId}` : "Nova inspeção");
  const laudoContextDescription = vendoMesa
    ? !mesaDisponivel
      ? "A mesa fica disponível após o primeiro laudo."
      : mesaTemMensagens
        ? conversaAtiva?.permiteEdicao
          ? "Use esta aba apenas para tratativas da mesa."
          : "Acompanhe os retornos técnicos sem misturar com o chat principal."
        : "Retornos técnicos da mesa aparecem aqui, separados do chat principal."
    : conversaAtiva?.laudoId
      ? conversaAtiva?.permiteReabrir
        ? "O laudo está em leitura. Reabra quando precisar complementar evidências."
        : "Registre achado, contexto e evidências com clareza."
      : "Envie a primeira mensagem para abrir a inspeção.";
  const threadSpotlight = vendoMesa
    ? !mesaDisponivel
      ? { label: "Sem laudo", tone: "muted" as const, icon: "clipboard-clock-outline" as const }
      : mesaTemMensagens
        ? conversaAtiva?.permiteEdicao
          ? { label: "Mesa ativa", tone: "accent" as const, icon: "message-reply-text-outline" as const }
          : { label: "Modo leitura", tone: "muted" as const, icon: "lock-outline" as const }
        : { label: "Sem retorno", tone: "muted" as const, icon: "clock-outline" as const }
    : conversaAtiva?.laudoId
      ? conversaAtiva?.permiteReabrir
        ? { label: "Modo leitura", tone: "muted" as const, icon: "lock-outline" as const }
        : { label: "Laudo ativo", tone: "success" as const, icon: "check-decagram-outline" as const }
      : { label: "Nova inspeção", tone: "success" as const, icon: "plus-circle-outline" as const };
  const mostrarContextoThread = vendoMesa || Boolean(conversaAtiva?.laudoId) || Boolean(resumoFilaOffline);
  const mesaContextChips = [
    mesaDisponivel
      ? {
          key: "status",
          label: conversaAtiva?.laudoCard?.status_card_label || "Mesa ativa",
          tone: "accent" as const,
          icon: "clipboard-text-outline" as const,
        }
      : null,
    notificacoesMesaLaudoAtual
      ? {
          key: "naolidas",
          label: `${notificacoesMesaLaudoAtual} nova${notificacoesMesaLaudoAtual === 1 ? "" : "s"}`,
          tone: "danger" as const,
          icon: "bell-ring-outline" as const,
        }
      : null,
    mesaDisponivel && !notificacoesMesaLaudoAtual && mesaTemMensagens
      ? {
          key: "modo",
          label: conversaAtiva?.permiteEdicao ? "Resposta liberada" : "Modo leitura",
          tone: conversaAtiva?.permiteEdicao ? ("success" as const) : ("muted" as const),
          icon: conversaAtiva?.permiteEdicao ? ("reply-outline" as const) : ("lock-outline" as const),
        }
      : null,
  ];
  const chatContextChips = [
    conversaAtiva?.laudoId
      ? {
          key: "status",
          label: conversaAtiva?.laudoCard?.status_card_label || "Em andamento",
          tone: "accent" as const,
          icon: "file-document-edit-outline" as const,
        }
      : {
          key: "nova",
          label: "Pronta para iniciar",
          tone: "success" as const,
          icon: "plus-circle-outline" as const,
        },
    conversaAtiva?.permiteReabrir
      ? {
          key: "reabrir",
          label: "Reabra para editar",
          tone: "danger" as const,
          icon: "history" as const,
        }
      : null,
    resumoFilaOffline
      ? {
          key: "offline",
          label: resumoFilaOffline,
          tone: statusApi === "offline" ? "danger" as const : "muted" as const,
          icon: statusApi === "offline" ? "cloud-off-outline" as const : "cloud-upload-outline" as const,
        }
      : null,
    conversaAtiva?.laudoId
      ? {
          key: "template",
          label: tipoTemplateAtivoLabel,
          tone: "muted" as const,
          icon: "shape-outline" as const,
        }
      : null,
  ];
  const chipsContextoThread = filtrarThreadContextChips(vendoMesa ? mesaContextChips : chatContextChips).slice(0, 2);
  const threadInsights = conversaAtiva?.laudoCard
    ? vendoMesa
      ? [
          {
            key: "status",
            label: "Status",
            value: conversaAtiva.laudoCard.status_card_label,
            detail: conversaAtiva.permiteEdicao ? "Resposta liberada no app" : "Acompanhamento em modo leitura",
            tone: statusVisualLaudo.tone,
            icon: statusVisualLaudo.icon,
          },
          {
            key: mesaTemMensagens ? "retornos" : "template",
            label: mesaTemMensagens ? "Mesa" : "Fluxo",
            value: mesaTemMensagens ? `${mensagensMesa.length} retorno${mensagensMesa.length === 1 ? "" : "s"}` : tipoTemplateAtivoLabel,
            detail: mesaTemMensagens ? "Retornos técnicos separados do chat." : "A mesa será usada quando houver retorno técnico.",
            tone: mesaTemMensagens ? ("muted" as const) : ("muted" as const),
            icon: mesaTemMensagens ? ("message-reply-text-outline" as const) : ("shape-outline" as const),
          },
        ]
      : [
          {
            key: "status",
            label: "Status",
            value: conversaAtiva.laudoCard.status_card_label,
            detail: conversaAtiva.permiteReabrir ? "Reabra quando precisar complementar." : "Fluxo ativo do inspetor.",
            tone: statusVisualLaudo.tone,
            icon: statusVisualLaudo.icon,
          },
          {
            key: "ultima",
            label: "Última atividade",
            value: conversaAtiva.laudoCard.hora_br || conversaAtiva.laudoCard.data_br,
            detail: [conversaAtiva.laudoCard.data_br, conversaAtiva.laudoCard.tipo_template].filter(Boolean).join(" • "),
            tone: "muted" as const,
            icon: "calendar-clock-outline" as const,
          },
        ]
    : [];

  return {
    chipsContextoThread,
    laudoContextDescription,
    laudoContextTitle,
    mostrarContextoThread,
    statusVisualLaudo,
    threadInsights,
    threadSpotlight,
  };
}
