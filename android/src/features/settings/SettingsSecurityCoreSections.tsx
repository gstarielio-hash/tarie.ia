import { TWO_FACTOR_METHOD_OPTIONS } from "../InspectorMobileApp.constants";
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
  provedoresConectados,
  onToggleProviderConnection,
}: SettingsSecurityConnectedAccountsSectionProps) {
  return (
    <SettingsSection
      icon="account-lock-outline"
      subtitle="Vincule múltiplos provedores, veja o status de cada conta e proteja o último método de acesso."
      testID="settings-section-contas-conectadas"
      title="Contas conectadas"
    >
      <>
        {provedoresConectados.map((provider) => (
          <SecurityProviderCard
            key={provider.id}
            onToggle={onToggleProviderConnection}
            provider={provider}
            testID={`settings-provider-${provider.id}`}
          />
        ))}
      </>
    </SettingsSection>
  );
}

export function SettingsSecuritySessionsSection({
  sessoesSuspeitasTotal,
  sessoesAtivas,
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
      <>
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
      </>
    </SettingsSection>
  );
}

export function SettingsSecurityTwoFactorSection({
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
        <SettingsPressRow
          description="Eles são mostrados uma única vez. Salve com segurança antes de sair desta tela."
          icon="key-chain-variant"
          onPress={() => void onCompartilharCodigosRecuperacao()}
          title="Códigos gerados"
          value={`${codigosRecuperacao.length} disponíveis`}
        />
      ) : null}
    </SettingsSection>
  );
}
