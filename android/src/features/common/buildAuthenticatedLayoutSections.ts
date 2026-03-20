import { TARIEL_APP_MARK } from "../InspectorMobileApp.constants";
import type {
  AuthenticatedLayoutInput,
  HistoryDrawerPanelMobileProps,
  ThreadContextCardPanelProps,
  ThreadHeaderControlsPanelProps,
} from "./inspectorUiBuilderTypes";
import type { ThreadComposerPanelProps } from "../chat/ThreadComposerPanel";
import type { ThreadConversationPaneProps } from "../chat/ThreadConversationPane";

export function buildHistoryDrawerPanelProps(
  input: AuthenticatedLayoutInput,
): HistoryDrawerPanelMobileProps {
  return {
    brandMarkSource: TARIEL_APP_MARK,
    buscaHistorico: input.buscaHistorico,
    conversasOcultasTotal: input.conversasOcultasTotal,
    historicoAgrupadoFinal: input.historicoAgrupadoFinal,
    historicoDrawerX: input.historicoDrawerX,
    historicoVazioTexto: input.historicoVazioTexto,
    historicoVazioTitulo: input.historicoVazioTitulo,
    historyDrawerPanResponder: input.historyDrawerPanResponder,
    laudoSelecionadoId: input.laudoSelecionadoId,
    onBuscaHistoricoChange: input.setBuscaHistorico,
    onCloseHistory: () => input.fecharHistorico({ limparBusca: true }),
    onExcluirConversaHistorico: (item) =>
      input.handleExcluirConversaHistorico(item),
    onSelecionarHistorico: (item) => {
      void input.handleSelecionarHistorico(item);
    },
  };
}

export function buildThreadComposerPanelProps(
  input: AuthenticatedLayoutInput,
): Omit<ThreadComposerPanelProps, "visible"> {
  return {
    accentColor: input.accentColor,
    anexoMesaRascunho: input.anexoMesaRascunho,
    anexoRascunho: input.anexoRascunho,
    canReopen: Boolean(input.conversaAtiva?.permiteReabrir),
    dynamicComposerInputStyle: input.dynamicComposerInputStyle,
    enviandoMensagem: input.enviandoMensagem,
    enviandoMesa: input.enviandoMesa,
    erroMesa: input.erroMesa,
    keyboardVisible: input.keyboardVisible,
    mensagem: input.mensagem,
    mensagemMesa: input.mensagemMesa,
    mensagemMesaReferenciaAtiva: input.mensagemMesaReferenciaAtiva,
    onAbrirSeletorAnexo: input.handleAbrirSeletorAnexo,
    onClearAnexoMesaRascunho: () => input.setAnexoMesaRascunho(null),
    onClearAnexoRascunho: () => input.setAnexoRascunho(null),
    onEnviarMensagem: () => {
      void input.handleEnviarMensagem();
    },
    onEnviarMensagemMesa: () => {
      void input.handleEnviarMensagemMesa();
    },
    onLimparReferenciaMesaAtiva: input.limparReferenciaMesaAtiva,
    onReopen: input.handleReabrir,
    onSetMensagem: input.setMensagem,
    onSetMensagemMesa: input.setMensagemMesa,
    placeholderComposer: input.placeholderComposer,
    placeholderMesa: input.placeholderMesa,
    podeAbrirAnexosChat: input.podeAbrirAnexosChat,
    podeAbrirAnexosMesa: input.podeAbrirAnexosMesa,
    podeAcionarComposer: input.podeAcionarComposer,
    podeEnviarComposer: input.podeEnviarComposer,
    podeEnviarMesa: input.podeEnviarMesa,
    podeUsarComposerMesa: input.podeUsarComposerMesa,
    showVoiceInputAction: input.showVoiceInputAction,
    onVoiceInputPress: input.onVoiceInputPress,
    voiceInputEnabled: input.voiceInputEnabled,
    composerNotice: input.composerNotice,
    vendoMesa: input.vendoMesa,
  };
}

export function buildThreadContextCardProps(
  input: AuthenticatedLayoutInput,
): ThreadContextCardPanelProps {
  return {
    chips: input.chipsContextoThread,
    description: input.laudoContextDescription,
    eyebrow: input.vendoMesa ? "mesa avaliadora" : "chat do inspetor",
    insights: input.threadInsights,
    spotlight: input.threadSpotlight,
    title: input.laudoContextTitle,
  };
}

export function buildThreadConversationPaneProps(
  input: AuthenticatedLayoutInput,
): ThreadConversationPaneProps {
  return {
    accentColor: input.accentColor,
    anexoAbrindoChave: input.anexoAbrindoChave,
    brandMarkSource: TARIEL_APP_MARK,
    carregandoConversa: input.carregandoConversa && !input.conversaAtiva,
    carregandoMesa: input.carregandoMesa,
    conversaPermiteEdicao: Boolean(input.conversaAtiva?.permiteEdicao),
    conversaVazia: input.conversaVazia,
    dynamicMessageBubbleStyle: input.dynamicMessageBubbleStyle,
    dynamicMessageTextStyle: input.dynamicMessageTextStyle,
    enviandoMensagem: input.enviandoMensagem,
    keyboardVisible: input.keyboardVisible,
    mesaDisponivel: input.mesaDisponivel,
    mensagemChatDestacadaId: input.mensagemChatDestacadaId,
    mensagensMesa: input.mensagensMesa,
    mensagensVisiveis: input.mensagensVisiveis,
    nomeUsuarioExibicao: input.nomeUsuarioExibicao,
    obterResumoReferenciaMensagem: input.obterResumoReferenciaMensagem,
    onAbrirAnexo: input.handleAbrirAnexo,
    onAbrirReferenciaNoChat: (id: number) => {
      void input.abrirReferenciaNoChat(id);
    },
    onDefinirReferenciaMesaAtiva: input.definirReferenciaMesaAtiva,
    onRegistrarLayoutMensagemChat: input.registrarLayoutMensagemChat,
    scrollRef: input.scrollRef,
    sessionAccessToken: input.sessionAccessToken,
    threadKeyboardPaddingBottom: input.threadKeyboardPaddingBottom,
    toAttachmentKey: input.chaveAnexo,
    vendoMesa: input.vendoMesa,
  };
}

export function buildThreadHeaderControlsProps(
  input: AuthenticatedLayoutInput,
): ThreadHeaderControlsPanelProps {
  return {
    filaOfflineTotal: input.filaOfflineOrdenada.length,
    headerSafeTopInset: input.headerSafeTopInset,
    keyboardVisible: input.keyboardVisible,
    notificacoesMesaLaudoAtual: input.notificacoesMesaLaudoAtual,
    notificacoesNaoLidas: input.notificacoesNaoLidas,
    onOpenNewChat: () => {
      void input.handleAbrirNovoChat();
    },
    onOpenChatTab: () => input.setAbaAtiva("chat"),
    onOpenHistory: input.handleAbrirHistorico,
    onOpenMesaTab: () => input.setAbaAtiva("mesa"),
    onOpenSettings: input.handleAbrirConfiguracoes,
    vendoMesa: input.vendoMesa,
  };
}
