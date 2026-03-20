import type { ComponentProps } from "react";

import { InspectorAuthenticatedLayout } from "../InspectorAuthenticatedLayout";
import {
  buildHistoryDrawerPanelProps,
  buildThreadComposerPanelProps,
  buildThreadContextCardProps,
  buildThreadConversationPaneProps,
  buildThreadHeaderControlsProps,
} from "./buildAuthenticatedLayoutSections";
import type { AuthenticatedLayoutInput } from "./inspectorUiBuilderTypes";

export function buildAuthenticatedLayoutProps(
  input: AuthenticatedLayoutInput,
): ComponentProps<typeof InspectorAuthenticatedLayout> {
  return {
    accentColor: input.accentColor,
    animacoesAtivas: input.animacoesAtivas,
    appGradientColors: input.appGradientColors,
    chatKeyboardVerticalOffset: input.chatKeyboardVerticalOffset,
    drawerOverlayOpacity: input.drawerOverlayOpacity,
    erroConversa: input.erroConversa,
    erroLaudos: input.erroLaudos,
    historyDrawerPanelProps: buildHistoryDrawerPanelProps(input),
    historyEdgePanHandlers: input.historyEdgePanResponder.panHandlers,
    historyOpen: input.historicoAberto,
    introVisivel: input.introVisivel,
    keyboardAvoidingBehavior: input.keyboardAvoidingBehavior,
    keyboardVisible: input.keyboardVisible,
    mesaTemMensagens: input.mesaTemMensagens,
    onClosePanels: input.fecharPaineisLaterais,
    onIntroDone: () => input.setIntroVisivel(false),
    sessionModalsStackProps: input.sessionModalsStackProps,
    settingsDrawerPanelProps: input.settingsDrawerPanelProps,
    settingsDrawerVisible: input.configuracoesAberta,
    settingsEdgePanHandlers: input.settingsEdgePanResponder.panHandlers,
    settingsOpen: input.configuracoesAberta,
    threadComposerPanelProps: buildThreadComposerPanelProps(input),
    threadContextCardProps: buildThreadContextCardProps(input),
    threadContextVisible: input.mostrarContextoThread && input.vendoMesa,
    threadConversationPaneProps: buildThreadConversationPaneProps(input),
    threadHeaderControlsProps: buildThreadHeaderControlsProps(input),
    vendoMesa: input.vendoMesa,
  };
}
