import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";

interface ThreadHeaderControlsProps {
  headerSafeTopInset: number;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  notificacoesNaoLidas: number;
  filaOfflineTotal: number;
  vendoMesa: boolean;
  onOpenChatTab: () => void;
  onOpenMesaTab: () => void;
  notificacoesMesaLaudoAtual: number;
}

export function ThreadHeaderControls({
  headerSafeTopInset,
  onOpenHistory,
  onOpenSettings,
  notificacoesNaoLidas,
  filaOfflineTotal,
  vendoMesa,
  onOpenChatTab,
  onOpenMesaTab,
  notificacoesMesaLaudoAtual,
}: ThreadHeaderControlsProps) {
  const totalBadge = notificacoesNaoLidas + filaOfflineTotal;

  return (
    <>
      <View
        style={[
          styles.chatHeader,
          headerSafeTopInset ? { paddingTop: headerSafeTopInset + 12 } : null,
        ]}
      >
        <View style={styles.cleanHeaderTopRow}>
          <Pressable
            hitSlop={12}
            onPress={onOpenHistory}
            style={styles.cleanNavButton}
            testID="open-history-button"
          >
            <MaterialCommunityIcons color={colors.textPrimary} name="history" size={22} />
          </Pressable>
          <View style={styles.cleanHeaderSpacer} />
          <Pressable
            hitSlop={12}
            onPress={onOpenSettings}
            style={styles.cleanNavButton}
            testID="open-settings-button"
          >
            <MaterialCommunityIcons color={colors.textPrimary} name="cog-outline" size={22} />
            {totalBadge ? (
              <View style={styles.cleanNavBadge}>
                <Text style={styles.cleanNavBadgeText}>
                  {Math.min(totalBadge, 9)}
                  {totalBadge > 9 ? "+" : ""}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <View style={styles.cleanTabShell}>
        <View style={styles.threadTabs}>
          <Pressable
            onPress={onOpenChatTab}
            style={[styles.threadTab, !vendoMesa ? styles.threadTabActive : null]}
            testID="chat-tab-button"
          >
            <MaterialCommunityIcons
              color={!vendoMesa ? colors.white : colors.textSecondary}
              name="message-processing-outline"
              size={16}
            />
            <Text style={[styles.threadTabText, !vendoMesa ? styles.threadTabTextActive : null]}>
              Chat
            </Text>
          </Pressable>
          <Pressable
            onPress={onOpenMesaTab}
            style={[styles.threadTab, vendoMesa ? styles.threadTabActive : null]}
            testID="mesa-tab-button"
          >
            <MaterialCommunityIcons
              color={vendoMesa ? colors.white : colors.textSecondary}
              name="clipboard-text-outline"
              size={16}
            />
            <Text style={[styles.threadTabText, vendoMesa ? styles.threadTabTextActive : null]}>
              Mesa
            </Text>
            {notificacoesMesaLaudoAtual ? (
              <View style={[styles.threadTabBadge, vendoMesa ? styles.threadTabBadgeActive : null]}>
                <Text style={[styles.threadTabBadgeText, vendoMesa ? styles.threadTabBadgeTextActive : null]}>
                  {notificacoesMesaLaudoAtual > 9 ? "9+" : notificacoesMesaLaudoAtual}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>
    </>
  );
}
