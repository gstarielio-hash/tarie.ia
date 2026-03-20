import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";
import { SettingsStatusPill } from "./SettingsPrimitives";

export interface SecurityConnectedProvider {
  id: "google" | "apple" | "microsoft";
  label: string;
  connected: boolean;
  email: string;
  requiresReauth: boolean;
}

export interface SecuritySessionDevice {
  id: string;
  title: string;
  current: boolean;
  suspicious?: boolean;
  meta: string;
  location: string;
  lastSeen: string;
}

export interface SecurityEventItemView {
  id: string;
  title: string;
  critical?: boolean;
  meta: string;
  status: string;
  type: "login" | "provider" | "2fa" | "data" | "session";
}

export function SecurityProviderCard({
  provider,
  onToggle,
  testID,
}: {
  provider: SecurityConnectedProvider;
  onToggle: (provider: SecurityConnectedProvider) => void;
  testID?: string;
}) {
  const iconName =
    provider.id === "google"
      ? "google"
      : provider.id === "apple"
        ? "apple"
        : "microsoft-windows";
  const iconColor =
    provider.id === "google"
      ? "#DB4437"
      : provider.id === "apple"
        ? colors.textPrimary
        : "#2563EB";

  return (
    <View style={styles.securityProviderCard} testID={testID}>
      <View style={styles.securityProviderMain}>
        <View style={styles.securityProviderIconShell}>
          <MaterialCommunityIcons color={iconColor} name={iconName} size={22} />
        </View>
        <View style={styles.securityProviderCopy}>
          <View style={styles.securityProviderHeading}>
            <Text style={styles.securityProviderTitle}>{provider.label}</Text>
            <SettingsStatusPill
              label={provider.connected ? "Conectado" : "Não conectado"}
              tone={provider.connected ? "success" : "muted"}
            />
          </View>
          <Text style={styles.securityProviderMeta}>
            {provider.connected && provider.email
              ? provider.email
              : "Nenhum email vinculado"}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => onToggle(provider)}
        style={[
          styles.securityProviderActionButton,
          provider.connected ? styles.securityProviderActionButtonDanger : null,
        ]}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Text
          style={[
            styles.securityProviderActionText,
            provider.connected ? styles.securityProviderActionTextDanger : null,
          ]}
        >
          {provider.connected ? "Desconectar" : "Conectar"}
        </Text>
      </Pressable>
    </View>
  );
}

export function SecuritySessionCard({
  item,
  onClose,
  onReview,
  testID,
}: {
  item: SecuritySessionDevice;
  onClose: (item: SecuritySessionDevice) => void;
  onReview: (item: SecuritySessionDevice) => void;
  testID?: string;
}) {
  return (
    <View style={styles.securitySessionCard} testID={testID}>
      <View style={styles.securitySessionTop}>
        <View style={styles.securitySessionCopy}>
          <View style={styles.securitySessionHeading}>
            <Text style={styles.securitySessionTitle}>{item.title}</Text>
            {item.current ? (
              <SettingsStatusPill label="Sessão atual" tone="accent" />
            ) : item.suspicious ? (
              <SettingsStatusPill label="Atividade incomum" tone="danger" />
            ) : null}
          </View>
          <Text style={styles.securitySessionMeta}>{item.meta}</Text>
          <Text style={styles.securitySessionMeta}>{item.location}</Text>
          <Text style={styles.securitySessionMeta}>
            Último acesso: {item.lastSeen}
          </Text>
        </View>
      </View>
      <View style={styles.securitySessionActions}>
        <Pressable
          onPress={() => onReview(item)}
          style={[
            styles.securitySessionActionButton,
            item.suspicious
              ? styles.securitySessionReviewButtonDanger
              : styles.securitySessionReviewButton,
          ]}
          testID={testID ? `${testID}-review` : undefined}
        >
          <Text
            style={[
              styles.securitySessionActionText,
              item.suspicious
                ? styles.securitySessionReviewButtonTextDanger
                : styles.securitySessionReviewButtonText,
            ]}
          >
            {item.suspicious ? "Marcar segura" : "Sinalizar"}
          </Text>
        </Pressable>
        <Pressable
          disabled={item.current}
          onPress={() => onClose(item)}
          style={[
            styles.securitySessionActionButton,
            item.current ? styles.securitySessionActionButtonDisabled : null,
          ]}
          testID={testID ? `${testID}-close` : undefined}
        >
          <Text style={styles.securitySessionActionText}>
            {item.current ? "Em uso" : "Encerrar sessão"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SecurityEventCard({ item }: { item: SecurityEventItemView }) {
  return (
    <View style={styles.securityEventCard}>
      <View style={styles.securityEventTop}>
        <Text style={styles.securityEventTitle}>{item.title}</Text>
        {item.critical ? (
          <SettingsStatusPill label="Crítico" tone="danger" />
        ) : null}
      </View>
      <Text style={styles.securityEventMeta}>{item.meta}</Text>
      <Text style={styles.securityEventStatus}>{item.status}</Text>
    </View>
  );
}
