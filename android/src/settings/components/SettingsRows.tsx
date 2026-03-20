import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SettingsPressRow, SettingsSwitchRow } from "../../features/settings/SettingsPrimitives";
import { colors, spacing } from "../../theme/tokens";

type SettingsIconName = ComponentProps<typeof SettingsPressRow>["icon"];

interface SettingsRowStateProps {
  loading?: boolean;
  disabled?: boolean;
  error?: string | null;
}

interface SettingsValueRowProps extends SettingsRowStateProps {
  icon: SettingsIconName;
  title: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  testID?: string;
}

interface SettingsToggleRowProps extends SettingsRowStateProps {
  icon: SettingsIconName;
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}

function SettingsRowState({ loading, disabled, error }: SettingsRowStateProps) {
  const message = error || (loading ? "Carregando..." : disabled ? "Indisponível neste contexto" : "");
  if (!message) {
    return null;
  }
  return (
    <Text style={[styles.message, error ? styles.error : null]}>
      {message}
    </Text>
  );
}

export function SettingsRow(props: SettingsValueRowProps) {
  return <SettingsValueRow {...props} />;
}

export function SettingsValueRow({
  loading,
  disabled,
  error,
  value,
  onPress,
  ...rest
}: SettingsValueRowProps) {
  return (
    <View style={[styles.wrapper, disabled || loading ? styles.dimmed : null]}>
      <SettingsPressRow
        {...rest}
        onPress={disabled || loading ? undefined : onPress}
        value={loading ? "Carregando..." : error ? "Erro" : value}
      />
      <SettingsRowState disabled={disabled} error={error} loading={loading} />
    </View>
  );
}

export function SettingsActionRow(props: SettingsValueRowProps) {
  return <SettingsValueRow {...props} />;
}

export function SettingsDangerRow(props: Omit<SettingsValueRowProps, "danger">) {
  return <SettingsValueRow {...props} danger />;
}

export function SettingsToggleRow({
  loading,
  disabled,
  error,
  onValueChange,
  ...rest
}: SettingsToggleRowProps) {
  return (
    <View style={[styles.wrapper, disabled || loading ? styles.dimmed : null]}>
      <SettingsSwitchRow
        {...rest}
        onValueChange={(value) => {
          if (disabled || loading) {
            return;
          }
          onValueChange(value);
        }}
      />
      <SettingsRowState disabled={disabled} error={error} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  dimmed: {
    opacity: 0.55,
  },
  error: {
    color: colors.danger,
  },
  message: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  wrapper: {
    gap: spacing.xs,
  },
});
