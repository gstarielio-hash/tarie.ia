import { Text, View } from "react-native";

import { ProfileAvatarPicker } from "../../settings/components";
import { styles } from "../InspectorMobileApp.styles";
import { SettingsPrintRow } from "./SettingsPrimitives";
import type {
  SettingsDrawerPage,
  SettingsSectionKey,
} from "./settingsNavigationMeta";

interface SettingsOverviewContentProps {
  settingsPrintDarkMode: boolean;
  perfilFotoUri: string;
  iniciaisPerfilConfiguracao: string;
  nomeUsuarioExibicao: string;
  workspaceResumoConfiguracao: string;
  planoResumoConfiguracao: string;
  contaEmailLabel: string;
  contaTelefoneLabel: string;
  temaResumoConfiguracao: string;
  corDestaqueResumoConfiguracao: string;
  onUploadFotoPerfil: () => void;
  onAbrirPaginaConfiguracoes: (
    page: SettingsDrawerPage,
    section?: SettingsSectionKey | "all",
  ) => void;
  onReportarProblema: () => void;
  onFecharConfiguracoes: () => void;
  onLogout: () => void | Promise<void>;
}

export function SettingsOverviewContent({
  settingsPrintDarkMode,
  perfilFotoUri,
  iniciaisPerfilConfiguracao,
  nomeUsuarioExibicao,
  workspaceResumoConfiguracao,
  planoResumoConfiguracao: _planoResumoConfiguracao,
  contaEmailLabel,
  contaTelefoneLabel,
  temaResumoConfiguracao,
  corDestaqueResumoConfiguracao,
  onUploadFotoPerfil,
  onAbrirPaginaConfiguracoes,
  onReportarProblema,
  onFecharConfiguracoes,
  onLogout,
}: SettingsOverviewContentProps) {
  return (
    <View style={styles.settingsPrintOverview}>
      <View style={styles.settingsPrintProfileBlock}>
        <ProfileAvatarPicker
          darkMode={settingsPrintDarkMode}
          fallbackLabel={iniciaisPerfilConfiguracao}
          onPress={onUploadFotoPerfil}
          photoUri={perfilFotoUri}
          testID="settings-overview-profile-photo"
        />
        <Text
          style={[
            styles.settingsPrintProfileName,
            settingsPrintDarkMode ? styles.settingsPrintProfileNameDark : null,
          ]}
        >
          {nomeUsuarioExibicao}
        </Text>
      </View>

      <View style={styles.settingsPrintSectionBlock}>
        <Text
          style={[
            styles.settingsPrintSectionTitle,
            settingsPrintDarkMode ? styles.settingsPrintSectionTitleDark : null,
          ]}
        >
          Meu Tariel
        </Text>
        <View
          style={[
            styles.settingsPrintGroupCard,
            settingsPrintDarkMode ? styles.settingsPrintGroupCardDark : null,
          ]}
        >
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="tune-variant"
            infoText="Ajuste aparência, comportamento da IA e alertas do aplicativo."
            onPress={() => onAbrirPaginaConfiguracoes("experiencia")}
            testID="settings-print-personalizacao-row"
            title="Experiência do app"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="apps"
            infoText="Acesse sistema, voz, atividade e canais de suporte do aplicativo."
            last
            onPress={() => onAbrirPaginaConfiguracoes("sistemaSuporte")}
            testID="settings-print-aplicativos-row"
            title="Sistema e suporte"
          />
        </View>
      </View>

      <View style={styles.settingsPrintSectionBlock}>
        <Text
          style={[
            styles.settingsPrintSectionTitle,
            settingsPrintDarkMode ? styles.settingsPrintSectionTitleDark : null,
          ]}
        >
          Conta
        </Text>
        <View
          style={[
            styles.settingsPrintGroupCard,
            settingsPrintDarkMode ? styles.settingsPrintGroupCardDark : null,
          ]}
        >
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="briefcase-outline"
            infoText="Revise a empresa e o ambiente ativos para este acesso."
            onPress={() => onAbrirPaginaConfiguracoes("contaAcesso")}
            subtitle={workspaceResumoConfiguracao}
            testID="settings-print-workspace-row"
            title="Espaço de trabalho"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="star-circle-outline"
            infoText="Revise perfil autenticado, email, telefone e senha da conta."
            onPress={() => onAbrirPaginaConfiguracoes("contaAcesso")}
            subtitle="Perfil autenticado"
            testID="settings-print-upgrade-row"
            title="Conta e acesso"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="email-outline"
            infoText="Revise e altere o email usado no acesso desta conta."
            onPress={() => onAbrirPaginaConfiguracoes("contaAcesso")}
            subtitle={contaEmailLabel}
            testID="settings-print-email-row"
            title="E-mail"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="phone-outline"
            infoText="Consulte o número de telefone sincronizado com o perfil autenticado."
            last
            onPress={() => onAbrirPaginaConfiguracoes("contaAcesso")}
            subtitle={contaTelefoneLabel}
            testID="settings-print-phone-row"
            title="Número de telefone"
          />
        </View>
      </View>

      <View style={styles.settingsPrintSectionBlock}>
        <View
          style={[
            styles.settingsPrintGroupCard,
            settingsPrintDarkMode ? styles.settingsPrintGroupCardDark : null,
          ]}
        >
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="brightness-6"
            infoText="Defina tema, densidade e aparência geral do aplicativo."
            onPress={() =>
              onAbrirPaginaConfiguracoes("experiencia", "aparencia")
            }
            subtitle={temaResumoConfiguracao}
            testID="settings-print-aparencia-row"
            title="Aparência"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="eyedropper-variant"
            infoText="Escolha a cor de detalhe usada em destaques discretos do app."
            last
            onPress={() =>
              onAbrirPaginaConfiguracoes("experiencia", "aparencia")
            }
            subtitle={corDestaqueResumoConfiguracao}
            testID="settings-print-accent-row"
            title="Cor de ênfase"
            trailingIcon="chevron-right"
          />
        </View>
      </View>

      <View style={styles.settingsPrintSectionBlock}>
        <View
          style={[
            styles.settingsPrintGroupCard,
            settingsPrintDarkMode ? styles.settingsPrintGroupCardDark : null,
          ]}
        >
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="bell-outline"
            infoText="Controle push, som, vibração e privacidade das notificações."
            onPress={() =>
              onAbrirPaginaConfiguracoes("experiencia", "notificacoes")
            }
            testID="settings-print-notificacoes-row"
            title="Notificações"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="microphone-outline"
            infoText="Configure voz, microfone e recursos de ditado do app."
            onPress={() =>
              onAbrirPaginaConfiguracoes("sistemaSuporte", "recursosAvancados")
            }
            testID="settings-print-fala-row"
            title="Fala"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="database-cog-outline"
            infoText="Revise histórico, retenção, exportação e privacidade dos dados."
            onPress={() =>
              onAbrirPaginaConfiguracoes("seguranca", "dadosConversas")
            }
            testID="settings-print-data-controls-row"
            title="Controles de dados"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="shield-outline"
            infoText="Revise permissões, proteção local, privacidade e dados do aplicativo."
            onPress={() =>
              onAbrirPaginaConfiguracoes("seguranca", "protecaoDispositivo")
            }
            testID="settings-print-seguranca-row"
            title="Segurança"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="bug-outline"
            infoText="Envie um problema encontrado no aplicativo para análise."
            onPress={onReportarProblema}
            testID="settings-print-bug-row"
            title="Informar bug"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="information-outline"
            infoText="Veja informações do app, documentação e canais de ajuda."
            last
            onPress={() =>
              onAbrirPaginaConfiguracoes("sistemaSuporte", "suporte")
            }
            testID="settings-print-sobre-row"
            title="Sobre"
          />
        </View>
      </View>

      <View style={styles.settingsPrintSectionBlock}>
        <View
          style={[
            styles.settingsPrintGroupCard,
            settingsPrintDarkMode ? styles.settingsPrintGroupCardDark : null,
          ]}
        >
          <SettingsPrintRow
            danger
            darkMode={settingsPrintDarkMode}
            icon="logout-variant"
            last
            onPress={() => {
              onFecharConfiguracoes();
              void onLogout();
            }}
            testID="settings-print-sair-row"
            title="Sair"
            trailingIcon={null}
          />
        </View>
      </View>
    </View>
  );
}
