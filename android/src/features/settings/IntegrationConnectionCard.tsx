import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";
import { SettingsStatusPill } from "./SettingsPrimitives";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface ExternalIntegrationCardModel {
  id: string;
  label: string;
  description: string;
  icon: IconName;
  connected: boolean;
  lastSyncAt: string;
}

export function IntegrationConnectionCard<T extends ExternalIntegrationCardModel>({
  integration,
  syncing,
  onToggle,
  onSyncNow,
  formatarHorario,
  testID,
}: {
  integration: T;
  syncing: boolean;
  onToggle: (integration: T) => void;
  onSyncNow: (integration: T) => void;
  formatarHorario: (iso: string) => string;
  testID?: string;
}) {
  return (
    <View style={styles.securityProviderCard} testID={testID}>
      <View style={styles.securityProviderMain}>
        <View style={styles.securityProviderIconShell}>
          <MaterialCommunityIcons color={colors.ink700} name={integration.icon} size={22} />
        </View>
        <View style={styles.securityProviderCopy}>
          <View style={styles.securityProviderHeading}>
            <Text style={styles.securityProviderTitle}>{integration.label}</Text>
            <SettingsStatusPill
              label={integration.connected ? "Conectada" : "Desconectada"}
              tone={integration.connected ? "success" : "muted"}
            />
          </View>
          <Text style={styles.securityProviderMeta}>{integration.description}</Text>
          <Text style={styles.securityProviderMeta}>
            {integration.lastSyncAt
              ? `Última sincronização: ${formatarHorario(integration.lastSyncAt)}`
              : "Sem sincronização recente"}
          </Text>
        </View>
      </View>
      <View style={styles.securitySessionActions}>
        <Pressable
          onPress={() => onToggle(integration)}
          style={[
            styles.securityProviderActionButton,
            integration.connected ? styles.securityProviderActionButtonDanger : null,
          ]}
          testID={testID ? `${testID}-toggle` : undefined}
        >
          <Text
            style={[
              styles.securityProviderActionText,
              integration.connected ? styles.securityProviderActionTextDanger : null,
            ]}
          >
            {integration.connected ? "Desconectar" : "Conectar"}
          </Text>
        </Pressable>
        <Pressable
          disabled={!integration.connected || syncing}
          onPress={() => onSyncNow(integration)}
          style={[
            styles.securitySessionActionButton,
            !integration.connected || syncing ? styles.securitySessionActionButtonDisabled : null,
          ]}
          testID={testID ? `${testID}-sync` : undefined}
        >
          {syncing ? (
            <ActivityIndicator color={colors.ink700} size="small" />
          ) : (
            <Text style={styles.securitySessionActionText}>Sincronizar agora</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
