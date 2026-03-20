import type { ReactNode } from "react";
import { Pressable, Modal, StyleSheet, Text, View } from "react-native";

import { colors, radii, shadows, spacing } from "../../theme/tokens";

interface SettingsModalProps {
  visible: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  testID?: string;
}

export function SettingsModal({
  visible,
  title,
  description,
  children,
  onClose,
  testID,
}: SettingsModalProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop} testID={testID}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.copy}>
              <Text style={styles.title}>{title}</Text>
              {description ? <Text style={styles.description}>{description}</Text> : null}
            </View>
            <Pressable hitSlop={8} onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  closeButton: {
    paddingVertical: spacing.xs,
  },
  closeButtonText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    gap: spacing.lg,
    maxWidth: 480,
    padding: spacing.lg,
    width: "100%",
    ...shadows.panel,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
});
