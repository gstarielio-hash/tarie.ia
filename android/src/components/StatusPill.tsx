import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing } from "../theme/tokens";
import type { ApiHealthStatus } from "../types/mobile";

interface StatusPillProps {
  status: ApiHealthStatus;
}

const statusCopy: Record<ApiHealthStatus, { label: string; tone: string; dot: string }> = {
  checking: {
    label: "Verificando API",
    tone: "#203246",
    dot: colors.accentSoft,
  },
  online: {
    label: "API online",
    tone: "#173E2D",
    dot: colors.success,
  },
  offline: {
    label: "API indisponível",
    tone: "#4B1F1F",
    dot: colors.danger,
  },
};

export function StatusPill({ status }: StatusPillProps) {
  const current = statusCopy[status];

  return (
    <View style={[styles.container, { backgroundColor: current.tone }]}>
      <View style={[styles.dot, { backgroundColor: current.dot }]} />
      <Text style={styles.label}>{current.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  label: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
