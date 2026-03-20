import type { ComponentProps } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  SafeAreaView,
  Text,
  View,
  type GestureResponderHandlers,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { styles } from "./InspectorMobileApp.styles";
import { ThreadComposerPanel } from "./chat/ThreadComposerPanel";
import { ThreadConversationPane } from "./chat/ThreadConversationPane";
import { ThreadContextCard } from "./chat/ThreadContextCard";
import { ThreadHeaderControls } from "./chat/ThreadHeaderControls";
import { BrandLaunchOverlay } from "./common/BrandElements";
import { SessionModalsStack } from "./common/SessionModalsStack";
import { SidePanelsOverlay } from "./common/SidePanelsOverlay";
import { HistoryDrawerPanel } from "./history/HistoryDrawerPanel";
import { SettingsDrawerPanel } from "./settings/SettingsDrawerPanel";

interface InspectorAuthenticatedLayoutProps {
  accentColor: string;
  animacoesAtivas: boolean;
  appGradientColors: readonly [string, string];
  chatKeyboardVerticalOffset: number;
  drawerOverlayOpacity: Animated.Value;
  erroConversa: string;
  erroLaudos: string;
  historyEdgePanHandlers: GestureResponderHandlers;
  historyOpen: boolean;
  introVisivel: boolean;
  keyboardAvoidingBehavior: "padding" | "height" | undefined;
  keyboardVisible: boolean;
  onClosePanels: () => void;
  onIntroDone: () => void;
  settingsDrawerVisible: boolean;
  settingsEdgePanHandlers: GestureResponderHandlers;
  settingsOpen: boolean;
  threadContextVisible: boolean;
  vendoMesa: boolean;
  mesaTemMensagens: boolean;
  threadHeaderControlsProps: ComponentProps<typeof ThreadHeaderControls>;
  threadContextCardProps: Omit<ComponentProps<typeof ThreadContextCard>, "visible">;
  threadConversationPaneProps: ComponentProps<typeof ThreadConversationPane>;
  threadComposerPanelProps: Omit<ComponentProps<typeof ThreadComposerPanel>, "visible">;
  historyDrawerPanelProps: ComponentProps<typeof HistoryDrawerPanel>;
  settingsDrawerPanelProps: ComponentProps<typeof SettingsDrawerPanel>;
  sessionModalsStackProps: Record<string, any>;
}

export function InspectorAuthenticatedLayout({
  accentColor,
  animacoesAtivas,
  appGradientColors,
  chatKeyboardVerticalOffset,
  drawerOverlayOpacity,
  erroConversa,
  erroLaudos,
  historyEdgePanHandlers,
  historyOpen,
  introVisivel,
  keyboardAvoidingBehavior,
  keyboardVisible,
  onClosePanels,
  onIntroDone,
  settingsDrawerVisible,
  settingsEdgePanHandlers,
  settingsOpen,
  threadContextVisible,
  vendoMesa,
  mesaTemMensagens,
  threadHeaderControlsProps,
  threadContextCardProps,
  threadConversationPaneProps,
  threadComposerPanelProps,
  historyDrawerPanelProps,
  settingsDrawerPanelProps,
  sessionModalsStackProps,
}: InspectorAuthenticatedLayoutProps) {
  return (
    <LinearGradient colors={appGradientColors} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={keyboardAvoidingBehavior}
          keyboardVerticalOffset={chatKeyboardVerticalOffset}
        >
          <View style={styles.chatLayout}>
            <ThreadHeaderControls {...threadHeaderControlsProps} />

            <View style={[styles.chatPanel, keyboardVisible ? styles.chatPanelKeyboardVisible : null]}>
              {!!erroLaudos && <Text style={styles.errorText}>{erroLaudos}</Text>}
              {!!erroConversa && <Text style={styles.errorText}>{erroConversa}</Text>}

              <View style={[styles.threadBody, keyboardVisible ? styles.threadBodyKeyboardVisible : null]}>
                <ThreadContextCard {...threadContextCardProps} visible={threadContextVisible && !keyboardVisible} />
                <ThreadConversationPane {...threadConversationPaneProps} />
              </View>

              <ThreadComposerPanel
                {...threadComposerPanelProps}
                vendoMesa={vendoMesa}
                visible={!vendoMesa || mesaTemMensagens}
              />
            </View>
          </View>

          <SidePanelsOverlay
            anyPanelOpen={historyOpen || settingsOpen}
            drawerOverlayOpacity={drawerOverlayOpacity}
            historyEdgePanHandlers={historyEdgePanHandlers}
            historyOpen={historyOpen}
            keyboardVisible={keyboardVisible}
            onClosePanels={onClosePanels}
            renderHistoryDrawer={() => <HistoryDrawerPanel {...historyDrawerPanelProps} />}
            renderSettingsDrawer={() =>
              settingsDrawerVisible ? <SettingsDrawerPanel {...settingsDrawerPanelProps} /> : null
            }
            settingsEdgePanHandlers={settingsEdgePanHandlers}
            settingsOpen={settingsOpen}
          />

          <SessionModalsStack {...(sessionModalsStackProps as any)} />
        </KeyboardAvoidingView>
      </SafeAreaView>
      <BrandLaunchOverlay
        accentColor={accentColor}
        animationsEnabled={animacoesAtivas}
        onDone={onIntroDone}
        visible={introVisivel}
      />
    </LinearGradient>
  );
}
