import { Text, View } from "react-native";

import { styles } from "../InspectorMobileApp.styles";
import { SettingsPressRow, SettingsSection, SettingsTextField } from "./SettingsPrimitives";

interface SettingsAccountSectionContentProps {
  perfilNomeCompleto: string;
  perfilExibicaoLabel: string;
  provedorPrimario: string;
  contaEmailLabel: string;
  resumoMetodosConta: string;
  planoAtual: string;
  reautenticacaoStatus: string;
  perfilFotoHint: string;
  perfilFotoUri: string;
  perfilNome: string;
  perfilExibicao: string;
  cartaoAtual: string;
  onSetPerfilNome: (value: string) => void;
  onSetPerfilExibicao: (value: string) => void;
  onUploadFotoPerfil: () => void;
  onAlterarEmail: () => void;
  onAlterarSenha: () => void;
  onGerenciarPlano: () => void;
  onHistoricoPagamentos: () => void;
  onGerenciarPagamento: () => void;
  onFecharConfiguracoes: () => void;
  onLogout: () => void | Promise<void>;
  onExcluirConta: () => void;
}

export function SettingsAccountSectionContent({
  perfilNomeCompleto,
  perfilExibicaoLabel,
  provedorPrimario,
  contaEmailLabel,
  resumoMetodosConta,
  planoAtual,
  reautenticacaoStatus,
  perfilFotoHint,
  perfilFotoUri,
  perfilNome,
  perfilExibicao,
  cartaoAtual,
  onSetPerfilNome,
  onSetPerfilExibicao,
  onUploadFotoPerfil,
  onAlterarEmail,
  onAlterarSenha,
  onGerenciarPlano,
  onHistoricoPagamentos,
  onGerenciarPagamento,
  onFecharConfiguracoes,
  onLogout,
  onExcluirConta,
}: SettingsAccountSectionContentProps) {
  return (
    <SettingsSection
      icon="account-circle-outline"
      subtitle="Informações da conta e assinatura do inspetor."
      testID="settings-section-conta"
      title="Conta"
    >
      <View style={styles.settingsInfoGrid}>
        <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
          <Text style={styles.settingsInfoTitle}>Identidade</Text>
          <Text style={styles.settingsInfoText}>{perfilNomeCompleto}</Text>
          <Text style={styles.settingsInfoSubtle}>{perfilExibicaoLabel} no chat</Text>
        </View>
        <View style={[styles.settingsInfoCard, styles.settingsInfoGridItem]}>
          <Text style={styles.settingsInfoTitle}>Acesso principal</Text>
          <Text style={styles.settingsInfoText}>{provedorPrimario}</Text>
          <Text style={styles.settingsInfoSubtle}>{contaEmailLabel}</Text>
        </View>
      </View>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.settingsInfoTitle}>Resumo da conta</Text>
        <Text style={styles.settingsInfoText}>
          {resumoMetodosConta} • {planoAtual} • {reautenticacaoStatus}
        </Text>
      </View>
      <SettingsPressRow
        description={perfilFotoHint}
        icon="camera-plus-outline"
        onPress={onUploadFotoPerfil}
        testID="settings-account-photo-row"
        title="Foto de perfil"
        value={perfilFotoUri ? "Atualizada" : "Upload"}
      />
      <SettingsTextField
        icon="account-outline"
        onChangeText={onSetPerfilNome}
        placeholder="Nome completo"
        testID="settings-account-name-field"
        title="Nome do usuário"
        value={perfilNome}
      />
      <SettingsTextField
        icon="badge-account-outline"
        onChangeText={onSetPerfilExibicao}
        placeholder="Nome exibido no chat"
        testID="settings-account-display-name-field"
        title="Nome de exibição"
        value={perfilExibicao}
      />
      <SettingsPressRow
        description="Confirmado por email"
        icon="email-outline"
        onPress={onAlterarEmail}
        testID="settings-account-email-row"
        title="Email"
        value={contaEmailLabel}
      />
      <SettingsPressRow
        description="Senha atual, nova senha e confirmação"
        icon="lock-outline"
        onPress={onAlterarSenha}
        testID="settings-account-password-row"
        title="Alterar senha"
      />
      <SettingsPressRow
        description="Benefícios do plano e opções de upgrade"
        icon="star-circle-outline"
        onPress={onGerenciarPlano}
        testID="settings-account-plan-row"
        title="Plano / Assinatura"
        value={planoAtual}
      />
      <SettingsPressRow
        description="Cobranças e faturas anteriores"
        icon="receipt-text-outline"
        onPress={onHistoricoPagamentos}
        title="Histórico de pagamentos"
      />
      <SettingsPressRow
        description="Cartão cadastrado e método de pagamento"
        icon="credit-card-outline"
        onPress={onGerenciarPagamento}
        testID="settings-account-billing-row"
        title="Gerenciar pagamento"
        value={cartaoAtual}
      />
      <SettingsPressRow
        icon="logout-variant"
        onPress={() => {
          onFecharConfiguracoes();
          void onLogout();
        }}
        testID="settings-account-logout-row"
        title="Sair da conta"
      />
      <SettingsPressRow
        description="Exclusão permanente com confirmação dupla"
        danger
        icon="delete-alert-outline"
        onPress={onExcluirConta}
        testID="settings-account-delete-row"
        title="Excluir conta"
      />
    </SettingsSection>
  );
}
