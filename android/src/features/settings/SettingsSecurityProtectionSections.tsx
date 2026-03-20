import {
  LOCK_TIMEOUT_OPTIONS,
  SECURITY_EVENT_FILTERS,
} from "../InspectorMobileApp.constants";
import { styles } from "../InspectorMobileApp.styles";
import { SecurityEventCard, type SecurityEventItemView } from "./SecurityCards";
import {
  SettingsPressRow,
  SettingsSection,
  SettingsSegmentedRow,
  SettingsSwitchRow,
} from "./SettingsPrimitives";
import { View } from "react-native";

type LockTimeout = (typeof LOCK_TIMEOUT_OPTIONS)[number];
type SecurityEventFilter = (typeof SECURITY_EVENT_FILTERS)[number];

interface SettingsSecurityDeviceProtectionSectionProps {
  biometricsSupported: boolean;
  deviceBiometricsEnabled: boolean;
  requireAuthOnOpen: boolean;
  lockTimeout: LockTimeout;
  hideInMultitask: boolean;
  onToggleBiometriaNoDispositivo: (value: boolean) => void;
  onSetRequireAuthOnOpen: (value: boolean) => void;
  onSetLockTimeout: (value: LockTimeout) => void;
  onSetHideInMultitask: (value: boolean) => void;
}

interface SettingsSecurityIdentityVerificationSectionProps {
  reautenticacaoStatus: string;
  onReautenticacaoSensivel: () => void;
}

interface SettingsSecurityActivitySectionProps {
  filtroEventosSeguranca: SecurityEventFilter;
  eventosSegurancaFiltrados: SecurityEventItemView[];
  onSetFiltroEventosSeguranca: (value: SecurityEventFilter) => void;
  onReportarAtividadeSuspeita: () => void;
}

function nextOptionValue<T extends string>(
  current: T,
  options: readonly T[],
): T {
  const currentIndex = options.indexOf(current);
  if (currentIndex === -1) {
    return options[0];
  }
  return options[(currentIndex + 1) % options.length];
}

export function SettingsSecurityDeviceProtectionSection({
  biometricsSupported,
  deviceBiometricsEnabled,
  requireAuthOnOpen,
  lockTimeout,
  hideInMultitask,
  onToggleBiometriaNoDispositivo,
  onSetRequireAuthOnOpen,
  onSetLockTimeout,
  onSetHideInMultitask,
}: SettingsSecurityDeviceProtectionSectionProps) {
  return (
    <SettingsSection
      icon="cellphone-lock"
      subtitle="Proteja o acesso local ao aplicativo no dispositivo."
      testID="settings-section-protecao-dispositivo"
      title="Proteção no dispositivo"
    >
      {biometricsSupported ? (
        <SettingsSwitchRow
          description="Usa biometria do sistema para desbloqueio local."
          icon="fingerprint"
          onValueChange={onToggleBiometriaNoDispositivo}
          testID="settings-device-biometrics-row"
          title="Desbloquear app com biometria"
          value={deviceBiometricsEnabled}
        />
      ) : null}
      <SettingsSwitchRow
        description="Solicita autenticação ao abrir o app."
        icon="shield-account-outline"
        onValueChange={onSetRequireAuthOnOpen}
        testID="settings-device-auth-open-row"
        title="Exigir autenticação ao abrir"
        value={requireAuthOnOpen}
      />
      <SettingsPressRow
        icon="timer-lock-outline"
        onPress={() =>
          onSetLockTimeout(nextOptionValue(lockTimeout, LOCK_TIMEOUT_OPTIONS))
        }
        testID="settings-device-lock-timeout-row"
        title="Bloquear após inatividade"
        value={lockTimeout}
      />
      <SettingsSwitchRow
        description="Oculta informações sensíveis na multitarefa."
        icon="eye-off-outline"
        onValueChange={onSetHideInMultitask}
        testID="settings-device-hide-multitask-row"
        title="Ocultar conteúdo na multitarefa"
        value={hideInMultitask}
      />
    </SettingsSection>
  );
}

export function SettingsSecurityIdentityVerificationSection({
  reautenticacaoStatus,
  onReautenticacaoSensivel,
}: SettingsSecurityIdentityVerificationSectionProps) {
  return (
    <SettingsSection
      icon="shield-account-variant-outline"
      subtitle="Ações críticas exigem reconfirmação da identidade."
      title="Verificação de identidade"
    >
      <SettingsPressRow
        description="Janela temporária para exportar dados, excluir conta e ações críticas."
        icon="shield-refresh-outline"
        onPress={onReautenticacaoSensivel}
        title="Reautenticar agora"
        value={reautenticacaoStatus}
      />
      <SettingsPressRow
        description="Exportar dados, apagar histórico, desativar 2FA ou remover o último provedor."
        icon="alert-decagram-outline"
        onPress={onReautenticacaoSensivel}
        title="Ações protegidas"
        value="Sempre confirmadas"
      />
    </SettingsSection>
  );
}

export function SettingsSecurityActivitySection({
  filtroEventosSeguranca,
  eventosSegurancaFiltrados,
  onSetFiltroEventosSeguranca,
  onReportarAtividadeSuspeita,
}: SettingsSecurityActivitySectionProps) {
  return (
    <SettingsSection
      icon="timeline-alert-outline"
      subtitle="Acompanhe logins, conexões de provedores, exportações e eventos críticos."
      title="Atividade de segurança"
    >
      <SettingsSegmentedRow
        icon="filter-outline"
        onChange={onSetFiltroEventosSeguranca}
        options={SECURITY_EVENT_FILTERS}
        title="Filtros"
        value={filtroEventosSeguranca}
      />
      <View style={styles.securityStack}>
        {eventosSegurancaFiltrados.map((item) => (
          <SecurityEventCard item={item} key={item.id} />
        ))}
      </View>
      <SettingsPressRow
        danger
        description="Use quando reconhecer uma atividade fora do esperado."
        icon="alert-circle-outline"
        onPress={onReportarAtividadeSuspeita}
        title="Reportar atividade suspeita"
      />
    </SettingsSection>
  );
}
