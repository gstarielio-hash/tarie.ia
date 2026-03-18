import { Text, View } from "react-native";

import { TWO_FACTOR_METHOD_OPTIONS } from "../InspectorMobileApp.constants";
import { styles } from "../InspectorMobileApp.styles";
import {
  SecurityProviderCard,
  SecuritySessionCard,
  type SecurityConnectedProvider,
  type SecuritySessionDevice,
} from "./SecurityCards";
import {
  SettingsPressRow,
  SettingsSection,
  SettingsSegmentedRow,
  SettingsSwitchRow,
  SettingsTextField,
} from "./SettingsPrimitives";

type TwoFactorMethod = (typeof TWO_FACTOR_METHOD_OPTIONS)[number];

interface SettingsSecurityConnectedAccountsSectionProps {
  provedorPrimario: string;
  ultimoEventoProvedor: string;
  resumoAlertaMetodosConta: string;
  provedoresConectados: SecurityConnectedProvider[];
  provedoresConectadosTotal: number;
  onToggleProviderConnection: (provider: SecurityConnectedProvider) => void;
}

interface SettingsSecuritySessionsSectionProps {
  resumoSessaoAtual: string;
  outrasSessoesAtivas: SecuritySessionDevice[];
  sessoesSuspeitasTotal: number;
  sessoesAtivas: SecuritySessionDevice[];
  resumoBlindagemSessoes: string;
  ultimoEventoSessao: string;
  onEncerrarSessao: (item: SecuritySessionDevice) => void;
  onRevisarSessao: (item: SecuritySessionDevice) => void;
  onEncerrarSessaoAtual: () => void;
  onEncerrarSessoesSuspeitas: () => void;
  onEncerrarOutrasSessoes: () => void;
  onFecharConfiguracoes: () => void;
  onLogout: () => void | Promise<void>;
}

interface SettingsSecurityTwoFactorSectionProps {
  resumo2FAStatus: string;
  resumoCodigosRecuperacao: string;
  resumo2FAFootnote: string;
  reautenticacaoStatus: string;
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod;
  recoveryCodesEnabled: boolean;
  codigo2FA: string;
  codigosRecuperacao: string[];
  onToggle2FA: () => void;
  onMudarMetodo2FA: (value: TwoFactorMethod) => void;
  onSetRecoveryCodesEnabled: (value: boolean) => void;
  onSetCodigo2FA: (value: string) => void;
  onConfirmarCodigo2FA: () => void;
  onGerarCodigosRecuperacao: () => void;
  onCompartilharCodigosRecuperacao: () => void | Promise<void>;
}

export function SettingsSecurityConnectedAccountsSection({
  provedorPrimario,
  ultimoEventoProvedor,
  resumoAlertaMetodosConta,
  provedoresConectados,
  provedoresConectadosTotal,
  onToggleProviderConnection,
}: SettingsSecurityConnectedAccountsSectionProps) {
  return (
    <SettingsSection
      icon="account-lock-outline"
      subtitle="Vincule múltiplos provedores, veja o status de cada conta e proteja o último método de acesso."
      testID="settings-section-contas-conectadas"
      title="Contas conectadas"
    >
      <View style={styles.securityStack}>
        <View style={styles.settingsInfoGrid}>
          <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
            <Text style={styles.settingsInfoTitle}>Método principal</Text>
            <Text style={styles.settingsInfoText}>{provedorPrimario}</Text>
          </View>
          <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
            <Text style={styles.settingsInfoTitle}>Último vínculo</Text>
            <Text style={styles.settingsInfoText}>{ultimoEventoProvedor}</Text>
          </View>
        </View>
        <View style={styles.securityIntroCard}>
          <Text style={styles.securityIntroTitle}>Métodos de login conectados</Text>
          <Text style={styles.securityIntroText}>
            Vincule Google, Apple e Microsoft à mesma conta do usuário com proteção para não remover o último método de acesso.
          </Text>
        </View>
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Proteção do acesso</Text>
          <Text style={styles.settingsInfoText}>{resumoAlertaMetodosConta}</Text>
        </View>
        {provedoresConectados.map((provider) => (
          <SecurityProviderCard
            key={provider.id}
            onToggle={onToggleProviderConnection}
            provider={provider}
            testID={`settings-provider-${provider.id}`}
          />
        ))}
        <Text style={styles.securityFootnote}>
          {provedoresConectadosTotal > 1
            ? `${provedoresConectadosTotal} métodos ativos.`
            : "Mantenha mais de um método de acesso para evitar bloqueio da conta."}
        </Text>
      </View>
    </SettingsSection>
  );
}

export function SettingsSecuritySessionsSection({
  resumoSessaoAtual,
  outrasSessoesAtivas,
  sessoesSuspeitasTotal,
  sessoesAtivas,
  resumoBlindagemSessoes,
  ultimoEventoSessao,
  onEncerrarSessao,
  onRevisarSessao,
  onEncerrarSessaoAtual,
  onEncerrarSessoesSuspeitas,
  onEncerrarOutrasSessoes,
  onFecharConfiguracoes,
  onLogout,
}: SettingsSecuritySessionsSectionProps) {
  return (
    <SettingsSection
      icon="devices"
      subtitle="Visualize, invalide e acompanhe sessões ativas do usuário."
      testID="settings-section-sessoes"
      title="Sessões e dispositivos"
    >
      <View style={styles.securityStack}>
        <View style={styles.settingsInfoGrid}>
          <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
            <Text style={styles.settingsInfoTitle}>Sessão atual</Text>
            <Text style={styles.settingsInfoText}>{resumoSessaoAtual}</Text>
          </View>
          <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
            <Text style={styles.settingsInfoTitle}>Outros dispositivos</Text>
            <Text style={styles.settingsInfoText}>{outrasSessoesAtivas.length} sessão(ões)</Text>
            <Text style={styles.settingsInfoSubtle}>{sessoesSuspeitasTotal} suspeita(s)</Text>
          </View>
        </View>
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Resumo de risco</Text>
          <Text style={styles.settingsInfoText}>
            {sessoesAtivas.length} sessões ativas • {outrasSessoesAtivas.length} em outros dispositivos • {sessoesSuspeitasTotal} suspeita{sessoesSuspeitasTotal === 1 ? "" : "s"}
          </Text>
          <Text style={styles.settingsInfoSubtle}>{resumoBlindagemSessoes}</Text>
        </View>
        <View style={styles.settingsInfoCard}>
          <Text style={styles.settingsInfoTitle}>Última revisão</Text>
          <Text style={styles.settingsInfoText}>{ultimoEventoSessao}</Text>
        </View>
        {sessoesAtivas.map((item) => (
          <SecuritySessionCard
            item={item}
            key={item.id}
            onClose={onEncerrarSessao}
            onReview={onRevisarSessao}
            testID={`settings-session-${item.id}`}
          />
        ))}
        <SettingsPressRow
          danger
          description="Encerra o token do dispositivo atual com confirmação."
          icon="logout"
          onPress={onEncerrarSessaoAtual}
          testID="settings-session-current-close-row"
          title="Encerrar esta sessão"
        />
        <SettingsPressRow
          danger
          description="Remove somente sessões marcadas como suspeitas após a revisão."
          icon="shield-alert-outline"
          onPress={onEncerrarSessoesSuspeitas}
          testID="settings-session-close-suspicious-row"
          title="Encerrar sessões suspeitas"
          value={sessoesSuspeitasTotal ? `${sessoesSuspeitasTotal} suspeita(s)` : "Nenhuma"}
        />
        <SettingsPressRow
          danger
          icon="logout-variant"
          onPress={onEncerrarOutrasSessoes}
          testID="settings-session-close-others-row"
          title="Encerrar todas as outras"
        />
        <SettingsPressRow
          danger
          description="Encerra o acesso em todos os dispositivos ao sair."
          icon="power"
          onPress={() => {
            onFecharConfiguracoes();
            void onLogout();
          }}
          testID="settings-session-total-logout-row"
          title="Logout total"
        />
      </View>
    </SettingsSection>
  );
}

export function SettingsSecurityTwoFactorSection({
  resumo2FAStatus,
  resumoCodigosRecuperacao,
  resumo2FAFootnote,
  reautenticacaoStatus,
  twoFactorEnabled,
  twoFactorMethod,
  recoveryCodesEnabled,
  codigo2FA,
  codigosRecuperacao,
  onToggle2FA,
  onMudarMetodo2FA,
  onSetRecoveryCodesEnabled,
  onSetCodigo2FA,
  onConfirmarCodigo2FA,
  onGerarCodigosRecuperacao,
  onCompartilharCodigosRecuperacao,
}: SettingsSecurityTwoFactorSectionProps) {
  return (
    <SettingsSection
      icon="shield-star-outline"
      subtitle="Ative 2FA, configure método e gere códigos de recuperação."
      testID="settings-section-twofa"
      title="Verificação em duas etapas"
    >
      <View style={styles.settingsInfoGrid}>
        <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
          <Text style={styles.settingsInfoTitle}>Status</Text>
          <Text style={styles.settingsInfoText}>{resumo2FAStatus}</Text>
        </View>
        <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
          <Text style={styles.settingsInfoTitle}>Códigos</Text>
          <Text style={styles.settingsInfoText}>{resumoCodigosRecuperacao}</Text>
        </View>
      </View>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Estratégia de proteção</Text>
        <Text style={styles.settingsInfoText}>{resumo2FAFootnote}</Text>
        <Text style={styles.settingsInfoSubtle}>Reautenticação atual: {reautenticacaoStatus}</Text>
      </View>
      <SettingsSwitchRow
        description="Exige reautenticação antes de ativar ou desativar."
        icon="shield-check-outline"
        onValueChange={onToggle2FA}
        testID="settings-twofa-toggle-row"
        title="Verificação em duas etapas"
        value={twoFactorEnabled}
      />
      <SettingsSegmentedRow
        description="Método preferido de confirmação."
        icon="cellphone-key"
        onChange={onMudarMetodo2FA}
        options={TWO_FACTOR_METHOD_OPTIONS}
        testID="settings-twofa-method-row"
        title="Método"
        value={twoFactorMethod}
      />
      <SettingsSwitchRow
        description="Códigos exibidos uma única vez ao gerar."
        icon="key-chain-variant"
        onValueChange={onSetRecoveryCodesEnabled}
        title="Códigos de recuperação"
        value={recoveryCodesEnabled}
      />
      <SettingsTextField
        icon="numeric"
        onChangeText={onSetCodigo2FA}
        placeholder="Digite o código de confirmação"
        testID="settings-twofa-code-field"
        title="Código de confirmação"
        value={codigo2FA}
      />
      <SettingsPressRow
        icon="shield-check-outline"
        onPress={onConfirmarCodigo2FA}
        testID="settings-twofa-confirm-row"
        title="Confirmar código"
      />
      <SettingsPressRow
        icon="content-copy"
        onPress={onGerarCodigosRecuperacao}
        testID="settings-twofa-generate-recovery-row"
        title="Gerar ou regenerar códigos"
      />
      <SettingsPressRow
        description="Exporta os códigos em texto com confirmação de identidade."
        icon="export-variant"
        onPress={() => void onCompartilharCodigosRecuperacao()}
        testID="settings-twofa-share-recovery-row"
        title="Compartilhar códigos de recuperação"
        value={codigosRecuperacao.length ? `${codigosRecuperacao.length} códigos` : "Indisponível"}
      />
      {codigosRecuperacao.length ? (
        <View style={styles.securityIntroCard}>
          <Text style={styles.securityIntroTitle}>Códigos gerados</Text>
          <Text style={styles.securityIntroText}>
            Eles são mostrados uma única vez. Salve com segurança antes de sair desta tela.
          </Text>
          <View style={styles.securityRecoveryGrid}>
            {codigosRecuperacao.map((codigo) => (
              <View key={codigo} style={styles.securityRecoveryCode}>
                <Text style={styles.securityRecoveryCodeText}>{codigo}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </SettingsSection>
  );
}
