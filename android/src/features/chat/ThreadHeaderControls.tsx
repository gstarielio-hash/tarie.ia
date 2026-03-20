import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, Pressable, Text, View } from "react-native";

import { TARIEL_APP_MARK } from "../InspectorMobileApp.constants";
import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";

interface ThreadHeaderControlsProps {
  headerSafeTopInset: number;
  keyboardVisible: boolean;
  onOpenNewChat: () => void;
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
  keyboardVisible,
  onOpenNewChat,
  onOpenHistory,
  onOpenSettings,
  notificacoesNaoLidas,
  filaOfflineTotal,
  vendoMesa,
  onOpenChatTab,
  onOpenMesaTab,
  notificacoesMesaLaudoAtual,
}: ThreadHeaderControlsProps) {
  type HeaderChip = {
    key: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    accent: boolean;
  };

  const totalBadge = notificacoesNaoLidas + filaOfflineTotal;
  const title = vendoMesa ? "Mesa" : "Chat";
  const compactHeader = keyboardVisible;
  const subtitle = vendoMesa
    ? notificacoesMesaLaudoAtual
      ? `${notificacoesMesaLaudoAtual} retorno${notificacoesMesaLaudoAtual === 1 ? "" : "s"} novo${notificacoesMesaLaudoAtual === 1 ? "" : "s"} da mesa.`
      : ""
    : filaOfflineTotal
      ? `${filaOfflineTotal} pendência${filaOfflineTotal === 1 ? "" : "s"} pronta${filaOfflineTotal === 1 ? "" : "s"} para sincronizar.`
      : "";
  const statusChips = (
    vendoMesa
      ? [
          notificacoesMesaLaudoAtual
            ? {
                key: "mesa-novas",
                icon: "bell-ring-outline" as const,
                label: `${notificacoesMesaLaudoAtual} nova${notificacoesMesaLaudoAtual === 1 ? "" : "s"}`,
                accent: true,
              }
            : null,
        ].filter(Boolean)
      : [
          filaOfflineTotal
            ? {
                key: "chat-offline",
                icon: "cloud-upload-outline" as const,
                label: `${filaOfflineTotal} offline`,
                accent: true,
              }
            : null,
        ].filter(Boolean)
  ) as HeaderChip[];

  return (
    <>
      <View
        style={[
          styles.chatHeader,
          headerSafeTopInset ? { paddingTop: headerSafeTopInset + 12 } : null,
          compactHeader ? styles.chatHeaderCompact : null,
        ]}
      >
        <View style={styles.cleanHeaderTopRow}>
          <Pressable
            hitSlop={12}
            onPress={onOpenHistory}
            style={[
              styles.cleanNavButton,
              compactHeader ? styles.cleanNavButtonCompact : null,
            ]}
            testID="open-history-button"
          >
            <MaterialCommunityIcons
              color={colors.textPrimary}
              name="history"
              size={22}
            />
          </Pressable>
          <View
            style={[
              styles.cleanHeaderCopy,
              compactHeader ? styles.cleanHeaderCopyCompact : null,
            ]}
          >
            {!vendoMesa ? (
              <Pressable
                hitSlop={10}
                onPress={onOpenNewChat}
                style={[
                  styles.chatHomeButton,
                  compactHeader ? styles.chatHomeButtonCompact : null,
                ]}
                testID="open-new-chat-button"
              >
                <Image
                  source={TARIEL_APP_MARK}
                  style={[
                    styles.chatHomeIcon,
                    compactHeader ? styles.chatHomeIconCompact : null,
                  ]}
                />
                <Text
                  style={[
                    styles.cleanHeaderTitle,
                    compactHeader ? styles.cleanHeaderTitleCompact : null,
                  ]}
                >
                  {title}
                </Text>
              </Pressable>
            ) : (
              <Text
                style={[
                  styles.cleanHeaderTitle,
                  compactHeader ? styles.cleanHeaderTitleCompact : null,
                ]}
              >
                {title}
              </Text>
            )}
            {subtitle && !compactHeader ? (
              <Text style={styles.cleanHeaderSubtitle}>{subtitle}</Text>
            ) : null}
          </View>
          <Pressable
            hitSlop={12}
            onPress={onOpenSettings}
            style={[
              styles.cleanNavButton,
              compactHeader ? styles.cleanNavButtonCompact : null,
            ]}
            testID="open-settings-button"
          >
            <MaterialCommunityIcons
              color={colors.textPrimary}
              name="cog-outline"
              size={22}
            />
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

        {!!statusChips.length && !compactHeader ? (
          <View style={styles.cleanHeaderStatusRow}>
            <View style={styles.cleanHeaderChipRail}>
              {statusChips.map((item) => (
                <View
                  key={item.key}
                  style={[
                    styles.cleanHeaderChip,
                    item.accent ? styles.cleanHeaderChipAccent : null,
                  ]}
                >
                  <MaterialCommunityIcons
                    color={item.accent ? colors.accent : colors.textSecondary}
                    name={item.icon}
                    size={14}
                  />
                  <Text
                    style={[
                      styles.cleanHeaderChipText,
                      item.accent ? styles.cleanHeaderChipTextAccent : null,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.cleanTabShell,
          compactHeader ? styles.cleanTabShellCompact : null,
        ]}
      >
        <View
          style={[
            styles.threadTabs,
            compactHeader ? styles.threadTabsCompact : null,
          ]}
        >
          <Pressable
            onPress={onOpenChatTab}
            style={[
              styles.threadTab,
              compactHeader ? styles.threadTabCompact : null,
              !vendoMesa ? styles.threadTabActive : null,
            ]}
            testID="chat-tab-button"
          >
            <MaterialCommunityIcons
              color={!vendoMesa ? colors.white : colors.textSecondary}
              name="message-processing-outline"
              size={16}
            />
            <Text
              style={[
                styles.threadTabText,
                compactHeader ? styles.threadTabTextCompact : null,
                !vendoMesa ? styles.threadTabTextActive : null,
              ]}
            >
              Chat
            </Text>
          </Pressable>
          <Pressable
            onPress={onOpenMesaTab}
            style={[
              styles.threadTab,
              compactHeader ? styles.threadTabCompact : null,
              vendoMesa ? styles.threadTabActive : null,
            ]}
            testID="mesa-tab-button"
          >
            <MaterialCommunityIcons
              color={vendoMesa ? colors.white : colors.textSecondary}
              name="clipboard-text-outline"
              size={16}
            />
            <Text
              style={[
                styles.threadTabText,
                compactHeader ? styles.threadTabTextCompact : null,
                vendoMesa ? styles.threadTabTextActive : null,
              ]}
            >
              Mesa
            </Text>
            {notificacoesMesaLaudoAtual ? (
              <View
                style={[
                  styles.threadTabBadge,
                  vendoMesa ? styles.threadTabBadgeActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.threadTabBadgeText,
                    vendoMesa ? styles.threadTabBadgeTextActive : null,
                  ]}
                >
                  {notificacoesMesaLaudoAtual > 9
                    ? "9+"
                    : notificacoesMesaLaudoAtual}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>
    </>
  );
}
