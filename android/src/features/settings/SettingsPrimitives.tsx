import { MaterialCommunityIcons } from "@expo/vector-icons";
import { createContext, useContext, type ReactNode } from "react";
import {
  Alert,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export type SettingsStatusTone = "success" | "muted" | "danger" | "accent";
const SETTINGS_ICON_COLOR = colors.ink700;
const SettingsSectionLayoutContext = createContext(false);

export function SettingsSectionLayoutProvider({
  children,
  hideHeader,
}: {
  children: ReactNode;
  hideHeader: boolean;
}) {
  return (
    <SettingsSectionLayoutContext.Provider value={hideHeader}>
      {children}
    </SettingsSectionLayoutContext.Provider>
  );
}

function SettingsInfoIcon({
  title,
  description,
  icon,
  iconColor,
  iconSize = 18,
  style,
  testID,
}: {
  title: string;
  description: string;
  icon: IconName;
  iconColor: string;
  iconSize?: number;
  style: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`Informações sobre ${title}`}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        Alert.alert(title, description);
      }}
      style={style}
      testID={testID}
    >
      <MaterialCommunityIcons color={iconColor} name={icon} size={iconSize} />
    </Pressable>
  );
}

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
  const hideHeader = useContext(SettingsSectionLayoutContext);
  return (
    <View style={styles.settingsSection} testID={testID}>
      {!hideHeader ? (
        <View style={styles.settingsSectionHeader}>
          {subtitle ? (
            <SettingsInfoIcon
              description={subtitle}
              icon={icon}
              iconColor={SETTINGS_ICON_COLOR}
              iconSize={18}
              style={styles.settingsSectionIcon}
              title={title}
            />
          ) : (
            <View style={styles.settingsSectionIcon}>
              <MaterialCommunityIcons
                name={icon}
                size={18}
                color={SETTINGS_ICON_COLOR}
              />
            </View>
          )}
          <View style={styles.settingsSectionCopy}>
            <Text style={styles.settingsSectionTitle}>{title}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.settingsCard}>{children}</View>
    </View>
  );
}

export function SettingsGroupLabel({
  title,
  description: _description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.settingsGroupLabel}>
      <Text style={styles.settingsGroupEyebrow}>{title}</Text>
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
      {description ? (
        <SettingsInfoIcon
          description={description}
          icon={icon}
          iconColor={danger ? colors.danger : SETTINGS_ICON_COLOR}
          iconSize={18}
          style={[
            styles.settingsRowIcon,
            danger ? styles.settingsRowIconDanger : null,
          ]}
          title={title}
        />
      ) : (
        <View
          style={[
            styles.settingsRowIcon,
            danger ? styles.settingsRowIconDanger : null,
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={18}
            color={danger ? colors.danger : SETTINGS_ICON_COLOR}
          />
        </View>
      )}
      <View style={styles.settingsRowCopy}>
        <Text
          style={[
            styles.settingsRowTitle,
            danger ? styles.settingsRowTitleDanger : null,
          ]}
        >
          {title}
        </Text>
      </View>
      <View style={styles.settingsRowMeta}>
        {value ? (
          <Text
            style={[
              styles.settingsRowValue,
              danger ? { color: colors.danger } : null,
            ]}
          >
            {value}
          </Text>
        ) : null}
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
      {description ? (
        <SettingsInfoIcon
          description={description}
          icon={icon}
          iconColor={SETTINGS_ICON_COLOR}
          iconSize={18}
          style={styles.settingsRowIcon}
          title={title}
        />
      ) : (
        <View style={styles.settingsRowIcon}>
          <MaterialCommunityIcons
            name={icon}
            size={18}
            color={SETTINGS_ICON_COLOR}
          />
        </View>
      )}
      <View style={styles.settingsRowCopy}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
      </View>
      <Switch
        ios_backgroundColor="#E8DDD1"
        onValueChange={onValueChange}
        thumbColor={colors.white}
        trackColor={{ false: "#DDD1C4", true: colors.ink700 }}
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
        {description ? (
          <SettingsInfoIcon
            description={description}
            icon={icon}
            iconColor={SETTINGS_ICON_COLOR}
            iconSize={18}
            style={styles.settingsRowIcon}
            title={title}
          />
        ) : (
          <View style={styles.settingsRowIcon}>
            <MaterialCommunityIcons
              name={icon}
              size={18}
              color={SETTINGS_ICON_COLOR}
            />
          </View>
        )}
        <View style={styles.settingsRowCopy}>
          <Text style={styles.settingsRowTitle}>{title}</Text>
        </View>
      </View>
      <View style={styles.settingsSegmentedControl}>
        {options.map((option) => {
          const active = option === value;
          return (
            <Pressable
              key={`${title}-${option}`}
              onPress={() => onChange(option)}
              style={[
                styles.settingsSegmentPill,
                active ? styles.settingsSegmentPillActive : null,
              ]}
            >
              <Text
                style={[
                  styles.settingsSegmentText,
                  active ? styles.settingsSegmentTextActive : null,
                ]}
              >
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
        {description ? (
          <SettingsInfoIcon
            description={description}
            icon={icon}
            iconColor={SETTINGS_ICON_COLOR}
            iconSize={18}
            style={styles.settingsRowIcon}
            title={title}
          />
        ) : (
          <View style={styles.settingsRowIcon}>
            <MaterialCommunityIcons
              name={icon}
              size={18}
              color={SETTINGS_ICON_COLOR}
            />
          </View>
        )}
        <View style={styles.settingsRowCopy}>
          <Text style={styles.settingsRowTitle}>{title}</Text>
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
              style={[
                styles.settingsScaleStep,
                active ? styles.settingsScaleStepActive : null,
              ]}
            >
              <View
                style={[
                  styles.settingsScaleDot,
                  selected ? styles.settingsScaleDotActive : null,
                ]}
              />
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
  autoCapitalize = "sentences",
  autoCorrect = false,
  secureTextEntry = false,
  testID,
}: {
  icon: IconName;
  title: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  secureTextEntry?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.settingsFieldBlock} testID={testID}>
      <View style={styles.settingsFieldLabelRow}>
        <View style={styles.settingsRowIcon}>
          <MaterialCommunityIcons
            name={icon}
            size={18}
            color={SETTINGS_ICON_COLOR}
          />
        </View>
        <Text style={styles.settingsRowTitle}>{title}</Text>
      </View>
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry={secureTextEntry}
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
      <SettingsInfoIcon
        description={description}
        icon={icon}
        iconColor={
          tone === "accent"
            ? colors.ink700
            : tone === "success"
              ? colors.success
              : tone === "danger"
                ? colors.danger
                : colors.textSecondary
        }
        iconSize={20}
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
        title={title}
      />
      <View style={styles.settingsOverviewCopy}>
        <View style={styles.settingsOverviewHeading}>
          <Text style={styles.settingsOverviewTitle}>{title}</Text>
          <SettingsStatusPill
            label={badge}
            tone={tone === "muted" ? "accent" : tone}
          />
        </View>
      </View>
      <MaterialCommunityIcons
        color={colors.textSecondary}
        name="chevron-right"
        size={18}
      />
    </Pressable>
  );
}

export function SettingsPrintRow({
  icon,
  title,
  subtitle,
  infoText,
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
  infoText?: string;
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
      {infoText ? (
        <SettingsInfoIcon
          description={infoText}
          icon={icon}
          iconColor={danger ? colors.danger : SETTINGS_ICON_COLOR}
          iconSize={20}
          style={[
            styles.settingsPrintRowIconShell,
            darkMode ? styles.settingsPrintRowIconShellDark : null,
            danger ? styles.settingsPrintRowIconShellDanger : null,
            danger && darkMode
              ? styles.settingsPrintRowIconShellDangerDark
              : null,
          ]}
          title={title}
        />
      ) : (
        <View
          style={[
            styles.settingsPrintRowIconShell,
            darkMode ? styles.settingsPrintRowIconShellDark : null,
            danger ? styles.settingsPrintRowIconShellDanger : null,
            danger && darkMode
              ? styles.settingsPrintRowIconShellDangerDark
              : null,
          ]}
        >
          <MaterialCommunityIcons
            color={danger ? colors.danger : SETTINGS_ICON_COLOR}
            name={icon}
            size={20}
          />
        </View>
      )}
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
          <Text
            style={[
              styles.settingsPrintRowSubtitle,
              darkMode ? styles.settingsPrintRowSubtitleDark : null,
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailingIcon ? (
        <MaterialCommunityIcons
          color={
            danger ? colors.danger : darkMode ? "#AFC0D2" : colors.textSecondary
          }
          name={trailingIcon}
          size={20}
        />
      ) : null}
    </Pressable>
  );
}
