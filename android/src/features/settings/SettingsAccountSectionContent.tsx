import { SettingsPressRow, SettingsSection } from "./SettingsPrimitives";

interface SettingsAccountSectionContentProps {
  perfilNomeCompleto: string;
  perfilExibicaoLabel: string;
  provedorPrimario: string;
  contaEmailLabel: string;
  contaTelefoneLabel: string;
  workspaceAtual: string;
  resumoConta: string;
  perfilFotoHint: string;
  perfilFotoUri: string;
  onEditarPerfil: () => void;
  onUploadFotoPerfil: () => void;
  onAlterarEmail: () => void;
  onAlterarSenha: () => void;
  onSolicitarLogout: () => void;
}

export function SettingsAccountSectionContent({
  perfilNomeCompleto,
  perfilExibicaoLabel,
  provedorPrimario,
  contaEmailLabel,
  contaTelefoneLabel,
  workspaceAtual,
  resumoConta,
  perfilFotoHint,
  perfilFotoUri,
  onEditarPerfil,
  onUploadFotoPerfil,
  onAlterarEmail,
  onAlterarSenha,
  onSolicitarLogout,
}: SettingsAccountSectionContentProps) {
  return (
    <SettingsSection
      icon="account-circle-outline"
      subtitle="Perfil autenticado, email, telefone e senha do inspetor."
      testID="settings-section-conta"
      title="Conta"
    >
      <SettingsPressRow
        description={perfilFotoHint}
        icon="camera-plus-outline"
        onPress={onUploadFotoPerfil}
        testID="settings-account-photo-row"
        title="Foto de perfil"
        value={perfilFotoUri ? "Atualizada" : "Upload"}
      />
      <SettingsPressRow
        description="Edite nome completo, nome de exibição e telefone em um único fluxo."
        icon="account-outline"
        onPress={onEditarPerfil}
        testID="settings-account-name-field"
        title="Nome do usuário"
        value={perfilNomeCompleto || "Não informado"}
      />
      <SettingsPressRow
        description="Nome exibido no chat, histórico e demais áreas do app."
        icon="badge-account-outline"
        onPress={onEditarPerfil}
        testID="settings-account-display-name-field"
        title="Nome de exibição"
        value={perfilExibicaoLabel || "Não informado"}
      />
      <SettingsPressRow
        description="Email principal usado no acesso e no retorno de suporte."
        icon="email-outline"
        onPress={onAlterarEmail}
        testID="settings-account-email-row"
        title="E-mail"
        value={contaEmailLabel}
      />
      <SettingsPressRow
        description="Número sincronizado com o perfil autenticado da conta."
        icon="phone-outline"
        onPress={onEditarPerfil}
        testID="settings-account-phone-row"
        title="Telefone"
        value={contaTelefoneLabel}
      />
      <SettingsPressRow
        description="Método principal disponível hoje para autenticar neste app."
        icon="shield-account-outline"
        testID="settings-account-primary-access-row"
        title="Acesso principal"
        value={provedorPrimario}
      />
      <SettingsPressRow
        description={resumoConta}
        icon="briefcase-outline"
        testID="settings-account-workspace-row"
        title="Espaço de trabalho"
        value={workspaceAtual}
      />
      <SettingsPressRow
        description="Resumo do vínculo corporativo usado por esta sessão."
        icon="card-account-details-outline"
        testID="settings-account-summary-row"
        title="Resumo da conta"
        value={resumoConta}
      />
      <SettingsPressRow
        description="Senha atual, nova senha e confirmação"
        icon="lock-outline"
        onPress={onAlterarSenha}
        testID="settings-account-password-row"
        title="Alterar senha"
      />
      <SettingsPressRow
        danger
        icon="logout-variant"
        onPress={onSolicitarLogout}
        testID="settings-account-logout-row"
        title="Sair da conta"
      />
    </SettingsSection>
  );
}
