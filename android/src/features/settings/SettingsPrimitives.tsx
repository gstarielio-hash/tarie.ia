import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export type SettingsStatusTone = "success" | "muted" | "danger" | "accent";

export function SettingsSection({
  icon,
  title,
  subtitle,
  children,
  testID,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.settingsSection} testID={testID}>
      <View style={styles.settingsSectionHeader}>
        <View style={styles.settingsSectionIcon}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
        </View>
        <View style={styles.settingsSectionCopy}>
          <Text style={styles.settingsSectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.settingsSectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.settingsCard}>{children}</View>
    </View>
  );
}

export function SettingsGroupLabel({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.settingsGroupLabel}>
      <Text style={styles.settingsGroupEyebrow}>{title}</Text>
      {description ? <Text style={styles.settingsGroupDescription}>{description}</Text> : null}
    </View>
  );
}

export function SettingsPressRow({
  icon,
  title,
  value,
  description,
  onPress,
  danger = false,
  testID,
}: {
  icon: IconName;
  title: string;
  value?: string;
  description?: string;
  onPress?: () => void;
  danger?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={[styles.settingsRow, danger ? styles.settingsRowDanger : null]}
      testID={testID}
    >
      <View style={[styles.settingsRowIcon, danger ? styles.settingsRowIconDanger : null]}>
        <MaterialCommunityIcons name={icon} size={18} color={danger ? colors.danger : colors.accent} />
      </View>
      <View style={styles.settingsRowCopy}>
        <Text style={[styles.settingsRowTitle, danger ? styles.settingsRowTitleDanger : null]}>{title}</Text>
        {description ? <Text style={styles.settingsRowDescription}>{description}</Text> : null}
      </View>
      <View style={styles.settingsRowMeta}>
        {value ? <Text style={[styles.settingsRowValue, danger ? { color: colors.danger } : null]}>{value}</Text> : null}
        {onPress ? (
          <MaterialCommunityIcons
            name="chevron-right"
            size={18}
            color={danger ? colors.danger : colors.textSecondary}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export function SettingsSwitchRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  testID,
}: {
  icon: IconName;
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.settingsRow} testID={testID}>
      <View style={styles.settingsRowIcon}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.settingsRowCopy}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        {description ? <Text style={styles.settingsRowDescription}>{description}</Text> : null}
      </View>
      <Switch
        ios_backgroundColor="#E8DDD1"
        onValueChange={onValueChange}
        thumbColor={colors.white}
        trackColor={{ false: "#DDD1C4", true: colors.accentSoft }}
        value={value}
      />
    </View>
  );
}

export function SettingsSegmentedRow<T extends string>({
  icon,
  title,
  description,
  options,
  value,
  onChange,
  testID,
}: {
  icon: IconName;
  title: string;
  description?: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}) {
  return (
    <View style={styles.settingsBlockRow} testID={testID}>
      <View style={styles.settingsBlockHeader}>
        <View style={styles.settingsRowIcon}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
        </View>
        <View style={styles.settingsRowCopy}>
          <Text style={styles.settingsRowTitle}>{title}</Text>
          {description ? <Text style={styles.settingsRowDescription}>{description}</Text> : null}
        </View>
      </View>
      <View style={styles.settingsSegmentedControl}>
        {options.map((option) => {
          const active = option === value;
          return (
            <Pressable
              key={`${title}-${option}`}
              onPress={() => onChange(option)}
              style={[styles.settingsSegmentPill, active ? styles.settingsSegmentPillActive : null]}
            >
              <Text style={[styles.settingsSegmentText, active ? styles.settingsSegmentTextActive : null]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsScaleRow({
  title,
  icon,
  description,
  value,
  values,
  onChange,
  minLabel,
  maxLabel,
  testID,
}: {
  title: string;
  icon: IconName;
  description?: string;
  value: number;
  values: readonly number[];
  onChange: (value: number) => void;
  minLabel: string;
  maxLabel: string;
  testID?: string;
}) {
  return (
    <View style={styles.settingsBlockRow} testID={testID}>
      <View style={styles.settingsBlockHeader}>
        <View style={styles.settingsRowIcon}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
        </View>
        <View style={styles.settingsRowCopy}>
          <Text style={styles.settingsRowTitle}>{title}</Text>
          {description ? <Text style={styles.settingsRowDescription}>{description}</Text> : null}
        </View>
        <Text style={styles.settingsScaleValue}>{value.toFixed(1)}</Text>
      </View>
      <View style={styles.settingsScaleTrack}>
        {values.map((step) => {
          const active = step <= value;
          const selected = step === value;
          return (
            <Pressable
              key={`${title}-${step}`}
              onPress={() => onChange(step)}
              style={[styles.settingsScaleStep, active ? styles.settingsScaleStepActive : null]}
            >
              <View style={[styles.settingsScaleDot, selected ? styles.settingsScaleDotActive : null]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.settingsScaleLabels}>
        <Text style={styles.settingsScaleLabel}>{minLabel}</Text>
        <Text style={styles.settingsScaleLabel}>{maxLabel}</Text>
      </View>
    </View>
  );
}

export function SettingsTextField({
  icon,
  title,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  testID,
}: {
  icon: IconName;
  title: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address";
  testID?: string;
}) {
  return (
    <View style={styles.settingsFieldBlock} testID={testID}>
      <View style={styles.settingsFieldLabelRow}>
        <View style={styles.settingsRowIcon}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
        </View>
        <Text style={styles.settingsRowTitle}>{title}</Text>
      </View>
      <TextInput
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={styles.settingsTextField}
        testID={testID ? `${testID}-input` : undefined}
        value={value}
      />
    </View>
  );
}

export function SettingsStatusPill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: SettingsStatusTone;
}) {
  return (
    <View
      style={[
        styles.settingsStatusPill,
        tone === "success"
          ? styles.settingsStatusPillSuccess
          : tone === "danger"
            ? styles.settingsStatusPillDanger
            : tone === "accent"
              ? styles.settingsStatusPillAccent
              : null,
      ]}
    >
      <Text
        style={[
          styles.settingsStatusPillText,
          tone === "success"
            ? styles.settingsStatusPillTextSuccess
            : tone === "danger"
              ? styles.settingsStatusPillTextDanger
              : tone === "accent"
                ? styles.settingsStatusPillTextAccent
                : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function SettingsOverviewCard({
  icon,
  title,
  description,
  badge,
  onPress,
  tone = "muted",
  testID,
}: {
  icon: IconName;
  title: string;
  description: string;
  badge: string;
  onPress: () => void;
  tone?: "muted" | "accent" | "success" | "danger";
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.settingsOverviewCard,
        tone === "accent"
          ? styles.settingsOverviewCardAccent
          : tone === "success"
            ? styles.settingsOverviewCardSuccess
            : tone === "danger"
              ? styles.settingsOverviewCardDanger
              : null,
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.settingsOverviewIcon,
          tone === "accent"
            ? styles.settingsOverviewIconAccent
            : tone === "success"
              ? styles.settingsOverviewIconSuccess
              : tone === "danger"
                ? styles.settingsOverviewIconDanger
                : null,
        ]}
      >
        <MaterialCommunityIcons
          color={
            tone === "accent"
              ? colors.accent
              : tone === "success"
                ? colors.success
                : tone === "danger"
                  ? colors.danger
                  : colors.textSecondary
          }
          name={icon}
          size={20}
        />
      </View>
      <View style={styles.settingsOverviewCopy}>
        <View style={styles.settingsOverviewHeading}>
          <Text style={styles.settingsOverviewTitle}>{title}</Text>
          <SettingsStatusPill label={badge} tone={tone === "muted" ? "accent" : tone} />
        </View>
        <Text style={styles.settingsOverviewDescription}>{description}</Text>
      </View>
      <MaterialCommunityIcons color={colors.textSecondary} name="chevron-right" size={18} />
    </Pressable>
  );
}

export function SettingsPrintRow({
  icon,
  title,
  subtitle,
  onPress,
  trailingIcon = "chevron-right",
  danger = false,
  darkMode = false,
  last = false,
  testID,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailingIcon?: IconName | null;
  danger?: boolean;
  darkMode?: boolean;
  last?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.settingsPrintRow,
        darkMode ? styles.settingsPrintRowDark : null,
        danger ? styles.settingsPrintRowDanger : null,
        danger && darkMode ? styles.settingsPrintRowDangerDark : null,
        last ? styles.settingsPrintRowLast : null,
      ]}
      testID={testID}
    >
      <View
        style={[
          styles.settingsPrintRowIconShell,
          darkMode ? styles.settingsPrintRowIconShellDark : null,
          danger ? styles.settingsPrintRowIconShellDanger : null,
          danger && darkMode ? styles.settingsPrintRowIconShellDangerDark : null,
        ]}
      >
        <MaterialCommunityIcons color={danger ? colors.danger : colors.accent} name={icon} size={20} />
      </View>
      <View style={styles.settingsPrintRowCopy}>
        <Text
          style={[
            styles.settingsPrintRowTitle,
            darkMode ? styles.settingsPrintRowTitleDark : null,
            danger ? styles.settingsPrintRowTitleDanger : null,
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.settingsPrintRowSubtitle, darkMode ? styles.settingsPrintRowSubtitleDark : null]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailingIcon ? (
        <MaterialCommunityIcons
          color={danger ? colors.danger : darkMode ? "#AFC0D2" : colors.textSecondary}
          name={trailingIcon}
          size={20}
        />
      ) : null}
    </Pressable>
  );
}
