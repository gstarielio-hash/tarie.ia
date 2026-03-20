import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";

type ThreadTone = "accent" | "success" | "danger" | "muted";
type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface ThreadSpotlight {
  label: string;
  tone: ThreadTone;
  icon: IconName;
}

export interface ThreadChip {
  key: string;
  label: string;
  tone: ThreadTone;
  icon: IconName;
}

export interface ThreadInsight {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: ThreadTone;
  icon: IconName;
}

export interface ThreadContextCardProps {
  visible: boolean;
  eyebrow: string;
  title: string;
  description: string;
  spotlight: ThreadSpotlight;
  chips: ThreadChip[];
  insights: ThreadInsight[];
}

export function ThreadContextCard({
  visible,
  eyebrow,
  title,
  description,
  spotlight,
  chips,
  insights,
}: ThreadContextCardProps) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.threadHeaderCard}>
      <View style={styles.threadHeaderTop}>
        <View style={styles.threadHeaderCopy}>
          <Text style={styles.threadEyebrow}>{eyebrow}</Text>
          <Text style={styles.threadTitle}>{title}</Text>
          <Text style={styles.threadDescription}>{description}</Text>
        </View>
        <View
          style={[
            styles.threadSpotlightBadge,
            spotlight.tone === "accent"
              ? styles.threadSpotlightBadgeAccent
              : spotlight.tone === "success"
                ? styles.threadSpotlightBadgeSuccess
                : null,
          ]}
        >
          <MaterialCommunityIcons
            color={
              spotlight.tone === "accent"
                ? colors.accent
                : spotlight.tone === "success"
                  ? colors.success
                  : colors.textSecondary
            }
            name={spotlight.icon}
            size={14}
          />
          <Text
            style={[
              styles.threadSpotlightText,
              spotlight.tone === "accent"
                ? styles.threadSpotlightTextAccent
                : spotlight.tone === "success"
                  ? styles.threadSpotlightTextSuccess
                  : null,
            ]}
          >
            {spotlight.label}
          </Text>
        </View>
      </View>

      <View style={styles.threadContextChips}>
        {chips.map((item) => (
          <View
            key={item.key}
            style={[
              styles.threadContextChip,
              item.tone === "accent"
                ? styles.threadContextChipAccent
                : item.tone === "success"
                  ? styles.threadContextChipSuccess
                  : item.tone === "danger"
                    ? styles.threadContextChipDanger
                    : null,
            ]}
          >
            <MaterialCommunityIcons
              color={
                item.tone === "accent"
                  ? colors.accent
                  : item.tone === "success"
                    ? colors.success
                    : item.tone === "danger"
                      ? colors.danger
                      : colors.textSecondary
              }
              name={item.icon}
              size={14}
            />
            <Text
              style={[
                styles.threadContextChipText,
                item.tone === "accent"
                  ? styles.threadContextChipTextAccent
                  : item.tone === "success"
                    ? styles.threadContextChipTextSuccess
                    : item.tone === "danger"
                      ? styles.threadContextChipTextDanger
                      : null,
              ]}
            >
              {item.label}
            </Text>
          </View>
        ))}
      </View>

      {insights.length ? (
        <View style={styles.threadInsightGrid}>
          {insights.map((item) => (
            <View
              key={item.key}
              style={[
                styles.threadInsightCard,
                item.tone === "accent"
                  ? styles.threadInsightCardAccent
                  : item.tone === "success"
                    ? styles.threadInsightCardSuccess
                    : item.tone === "danger"
                      ? styles.threadInsightCardDanger
                      : null,
              ]}
            >
              <View
                style={[
                  styles.threadInsightIcon,
                  item.tone === "accent"
                    ? styles.threadInsightIconAccent
                    : item.tone === "success"
                      ? styles.threadInsightIconSuccess
                      : item.tone === "danger"
                        ? styles.threadInsightIconDanger
                        : null,
                ]}
              >
                <MaterialCommunityIcons
                  color={
                    item.tone === "accent"
                      ? colors.accent
                      : item.tone === "success"
                        ? colors.success
                        : item.tone === "danger"
                          ? colors.danger
                          : colors.textSecondary
                  }
                  name={item.icon}
                  size={18}
                />
              </View>
              <View style={styles.threadInsightCopy}>
                <Text style={styles.threadInsightLabel}>{item.label}</Text>
                <Text style={styles.threadInsightValue}>{item.value}</Text>
                <Text style={styles.threadInsightDetail}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
