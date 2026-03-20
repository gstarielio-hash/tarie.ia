import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors, iconSizes, radii, spacing, typography } from "../theme/tokens";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type EmptyStateTone = "default" | "accent" | "success" | "danger";

interface EmptyStateProps {
  icon: IconName;
  title?: string;
  description?: string;
  eyebrow?: string;
  tone?: EmptyStateTone;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  eyebrow,
  tone = "default",
  compact = false,
}: EmptyStateProps) {
  const iconColor =
    tone === "accent"
      ? colors.accent
      : tone === "success"
        ? colors.success
        : tone === "danger"
          ? colors.danger
          : colors.ink700;
  const iconShellStyle =
    tone === "accent"
      ? styles.iconShellAccent
      : tone === "success"
        ? styles.iconShellSuccess
        : tone === "danger"
          ? styles.iconShellDanger
          : styles.iconShellDefault;

  return (
    <View style={[styles.container, compact ? styles.containerCompact : null]}>
      <View style={[styles.iconShell, iconShellStyle]}>
        <MaterialCommunityIcons color={iconColor} name={icon} size={iconSizes.lg} />
      </View>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  containerCompact: {
    minHeight: 180,
    paddingHorizontal: spacing.lg,
  },
  iconShell: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  iconShellDefault: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.surfaceStroke,
  },
  iconShellAccent: {
    backgroundColor: colors.accentWash,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  iconShellSuccess: {
    backgroundColor: colors.successWash,
    borderWidth: 1,
    borderColor: colors.successSoft,
  },
  iconShellDanger: {
    backgroundColor: colors.dangerWash,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
  },
  eyebrow: {
    color: colors.textMuted,
    ...typography.eyebrow,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    textAlign: "center",
    maxWidth: 300,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 300,
  },
});
