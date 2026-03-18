import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, Pressable, Text, View } from "react-native";

import { colors } from "../../theme/tokens";
import { styles } from "../InspectorMobileApp.styles";
import { SettingsPrintRow } from "./SettingsPrimitives";
import type { SettingsDrawerPage } from "./settingsNavigationMeta";

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
  onAbrirPaginaConfiguracoes: (page: SettingsDrawerPage) => void;
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
  planoResumoConfiguracao,
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
        <View style={styles.settingsPrintAvatarShell}>
          {perfilFotoUri ? (
            <Image source={{ uri: perfilFotoUri }} style={styles.settingsPrintAvatarImage} />
          ) : (
            <View style={styles.settingsPrintAvatarFallback}>
              <Text style={styles.settingsPrintAvatarInitials}>{iniciaisPerfilConfiguracao}</Text>
            </View>
          )}
          <Pressable
            onPress={onUploadFotoPerfil}
            style={[
              styles.settingsPrintAvatarEditButton,
              settingsPrintDarkMode ? styles.settingsPrintAvatarEditButtonDark : null,
            ]}
            testID="settings-overview-profile-photo"
          >
            <MaterialCommunityIcons color={colors.accent} name="pencil" size={12} />
          </Pressable>
        </View>
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
        <View style={[styles.settingsPrintGroupCard, settingsPrintDarkMode ? styles.settingsPrintGroupCardDark : null]}>
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="tune-variant"
            onPress={() => onAbrirPaginaConfiguracoes("experiencia")}
            testID="settings-print-personalizacao-row"
            title="Personalização"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="apps"
            last
            onPress={() => onAbrirPaginaConfiguracoes("sistemaSuporte")}
            testID="settings-print-aplicativos-row"
            title="Aplicativos"
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
        <View style={[styles.settingsPrintGroupCard, settingsPrintDarkMode ? styles.settingsPrintGroupCardDark : null]}>
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="briefcase-outline"
            onPress={() => onAbrirPaginaConfiguracoes("contaAcesso")}
            subtitle={workspaceResumoConfiguracao}
            testID="settings-print-workspace-row"
            title="Espaço de trabalho"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="star-circle-outline"
            onPress={() => onAbrirPaginaConfiguracoes("contaAcesso")}
            testID="settings-print-upgrade-row"
            title="Faça upgrade para o Pro"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="card-account-details-outline"
            onPress={() => onAbrirPaginaConfiguracoes("contaAcesso")}
            subtitle={planoResumoConfiguracao}
            testID="settings-print-assinatura-row"
            title="Assinatura"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="email-outline"
            onPress={() => onAbrirPaginaConfiguracoes("contaAcesso")}
            subtitle={contaEmailLabel}
            testID="settings-print-email-row"
            title="E-mail"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="phone-outline"
            last
            onPress={() => onAbrirPaginaConfiguracoes("contaAcesso")}
            subtitle={contaTelefoneLabel}
            testID="settings-print-phone-row"
            title="Número de telefone"
          />
        </View>
      </View>

      <View style={styles.settingsPrintSectionBlock}>
        <View style={[styles.settingsPrintGroupCard, settingsPrintDarkMode ? styles.settingsPrintGroupCardDark : null]}>
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="brightness-6"
            onPress={() => onAbrirPaginaConfiguracoes("experiencia")}
            subtitle={temaResumoConfiguracao}
            testID="settings-print-aparencia-row"
            title="Aparência"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="eyedropper-variant"
            last
            onPress={() => onAbrirPaginaConfiguracoes("experiencia")}
            subtitle={corDestaqueResumoConfiguracao}
            testID="settings-print-accent-row"
            title="Cor de ênfase"
            trailingIcon="chevron-right"
          />
        </View>
      </View>

      <View style={styles.settingsPrintSectionBlock}>
        <View style={[styles.settingsPrintGroupCard, settingsPrintDarkMode ? styles.settingsPrintGroupCardDark : null]}>
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="cog-outline"
            onPress={() => onAbrirPaginaConfiguracoes("sistemaSuporte")}
            testID="settings-print-geral-row"
            title="Geral"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="bell-outline"
            onPress={() => onAbrirPaginaConfiguracoes("experiencia")}
            testID="settings-print-notificacoes-row"
            title="Notificações"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="microphone-outline"
            onPress={() => onAbrirPaginaConfiguracoes("sistemaSuporte")}
            testID="settings-print-fala-row"
            title="Fala"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="database-cog-outline"
            onPress={() => onAbrirPaginaConfiguracoes("seguranca")}
            testID="settings-print-data-controls-row"
            title="Controles de dados"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="shield-outline"
            onPress={() => onAbrirPaginaConfiguracoes("seguranca")}
            testID="settings-print-seguranca-row"
            title="Segurança"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="bug-outline"
            onPress={onReportarProblema}
            testID="settings-print-bug-row"
            title="Informar bug"
          />
          <SettingsPrintRow
            darkMode={settingsPrintDarkMode}
            icon="information-outline"
            last
            onPress={() => onAbrirPaginaConfiguracoes("sistemaSuporte")}
            testID="settings-print-sobre-row"
            title="Sobre"
          />
        </View>
      </View>

      <View style={styles.settingsPrintSectionBlock}>
        <View style={[styles.settingsPrintGroupCard, settingsPrintDarkMode ? styles.settingsPrintGroupCardDark : null]}>
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
