import type { ReactNode } from "react";
import {
  Animated,
  Modal,
  Pressable,
  View,
  type GestureResponderHandlers,
} from "react-native";

import { styles } from "../InspectorMobileApp.styles";

interface SidePanelsOverlayProps {
  anyPanelOpen: boolean;
  historyOpen: boolean;
  keyboardVisible: boolean;
  settingsOpen: boolean;
  drawerOverlayOpacity: Animated.Value;
  onClosePanels: () => void;
  historyEdgePanHandlers: GestureResponderHandlers;
  settingsEdgePanHandlers: GestureResponderHandlers;
  renderHistoryDrawer: () => ReactNode;
  renderSettingsDrawer: () => ReactNode;
}

export function SidePanelsOverlay({
  anyPanelOpen,
  historyOpen,
  keyboardVisible,
  settingsOpen,
  drawerOverlayOpacity,
  onClosePanels,
  historyEdgePanHandlers,
  settingsEdgePanHandlers,
  renderHistoryDrawer,
  renderSettingsDrawer,
}: SidePanelsOverlayProps) {
  return (
    <>
      <View pointerEvents="box-none" style={styles.sidePanelLayer}>
        {!anyPanelOpen && !keyboardVisible ? (
          <>
            <View
              {...historyEdgePanHandlers}
              style={[styles.sidePanelEdgeHitbox, styles.sidePanelEdgeHitboxLeft]}
            />
            <View
              {...settingsEdgePanHandlers}
              style={[styles.sidePanelEdgeHitbox, styles.sidePanelEdgeHitboxRight]}
            />
          </>
        ) : null}
      </View>

      <Modal
        animationType="none"
        hardwareAccelerated
        onRequestClose={onClosePanels}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={anyPanelOpen}
      >
        <View pointerEvents="box-none" style={styles.sidePanelModalRoot}>
          <Animated.View
            pointerEvents="box-none"
            style={[styles.sidePanelScrim, { opacity: drawerOverlayOpacity }]}
          >
            <Pressable onPress={onClosePanels} style={styles.sidePanelScrimPressable} />
          </Animated.View>

          {historyOpen ? renderHistoryDrawer() : null}
          {settingsOpen ? renderSettingsDrawer() : null}
        </View>
      </Modal>
    </>
  );
}
